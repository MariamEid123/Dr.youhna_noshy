import { supabase } from './lib/supabaseClient.js';

const BUCKET = 'client-documents';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILES = new Map([
  ['application/pdf', ['.pdf']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
]);
const REQUEST_STATUS_TO_DB = {
  waiting_client: 'waiting_for_client',
  rejected: 'cancelled',
};
const REQUEST_STATUS_FROM_DB = {
  waiting_for_client: 'waiting_client',
  cancelled: 'rejected',
};
const INVOICE_STATUS_FROM_DB = {
  draft: 'unpaid',
  issued: 'unpaid',
  pending: 'unpaid',
};
const APPOINTMENT_STATUS_FROM_DB = {
  scheduled: 'booked',
  confirmed: 'booked',
  completed: 'done',
};

const fail = (message) => {
  throw new Error(message);
};

const check = (result, fallback = 'تعذر إتمام العملية. يرجى المحاولة مرة أخرى.') => {
  if (result.error) {
    if (result.error.code === '23505' || result.error.code === '409') {
      fail('هذه البيانات مسجلة بالفعل أو أن الموعد محجوز.');
    }
    if (result.error.code === '42501' || result.error.code === 'PGRST301') {
      fail('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
    }
    if (result.error.code === 'PGRST116') {
      fail('البيانات المطلوبة غير موجودة.');
    }
    if (result.error.code === 'AuthApiError') {
      fail('تعذر التحقق من الحساب. يرجى تسجيل الدخول مرة أخرى.');
    }
    fail(fallback);
  }
  return result.data;
};

const sessionUser = async () => {
  const result = await supabase.auth.getUser();
  if (result.error || !result.data.user) {
    fail('انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.');
  }
  return result.data.user;
};

export const getProfile = async (authUser) => {
  if (!authUser) return null;
  const result = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role')
    .eq('id', authUser.id)
    .single();
  if (result.error) {
    console.error('Supabase profile lookup failed.', {
      category: result.error.code || 'unknown',
      ...(Number.isInteger(result.status) ? { status: result.status } : {}),
    });
  }
  const profile = check(result, 'تعذر تحميل بيانات الحساب.');
  if (profile.role === 'client') {
    const clientResult = await supabase.rpc('ensure_my_client_record');
    if (clientResult.error) {
      console.error('Supabase client profile initialization failed.', {
        category: clientResult.error.code || 'unknown',
        ...(Number.isInteger(clientResult.status) ? { status: clientResult.status } : {}),
      });
    }
    check(clientResult, 'ملف العميل غير جاهز. يرجى التواصل مع المكتب.');
  }
  return {
    id: profile.id,
    name: profile.full_name || authUser.email || '',
    email: profile.email || authUser.email || '',
    phone: profile.phone || '',
    role: profile.role,
  };
};

const getClient = async (clientId) => {
  const result = await supabase.from('clients').select('*').eq('id', clientId).single();
  return check(result, 'تعذر تحميل بيانات العميل.');
};

const getMyClient = async () => {
  const user = await sessionUser();
  check(await supabase.rpc('ensure_my_client_record'), 'ملف العميل غير جاهز. يرجى التواصل مع المكتب.');
  const result = await supabase.from('clients').select('*').eq('user_id', user.id).single();
  return check(result, 'ملف العميل غير جاهز. يرجى التواصل مع المكتب.');
};

const publicClient = (client) => ({
  _id: client.id,
  id: client.id,
  user_id: client.user_id,
  name: client.full_name,
  email: client.email,
  phone: client.phone,
  company: client.company_name,
  address: client.address,
  createdAt: client.created_at,
});

const cleanDatabaseError = (error, fallback) => {
  check({ data: null, error }, fallback);
};

const logActivity = async ({ action, entityType, entityId, description, metadata }) => {
  const user = await sessionUser();
  const result = await supabase.from('activity_logs').insert({
    user_id: user.id,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    description: description || null,
    metadata: metadata || null,
  });
  check(result, 'تم تنفيذ الإجراء، لكن تعذر حفظ سجل النشاط.');
};

const services = async () => {
  const result = await supabase
    .from('services')
    .select('id, name, description, active')
    .eq('active', true)
    .order('name');
  return check(result, 'تعذر تحميل قائمة الخدمات.').map((service) => ({
    _id: service.id,
    id: service.id,
    name: service.name,
    description: service.description,
    active: service.active,
  }));
};

const requestRows = async (params) => {
  let query = supabase
    .from('requests')
    .select('*, clients(id, user_id, full_name, email, phone, company_name)')
    .order('created_at', { ascending: false });
  if (params.get('client')) query = query.eq('client_id', params.get('client'));
  if (params.get('status')) {
    const status = REQUEST_STATUS_TO_DB[params.get('status')] || params.get('status');
    query = query.eq('status', status);
  }
  if (params.get('service')) query = query.eq('category', params.get('service'));

  const rows = check(await query, 'تعذر تحميل الطلبات.');
  const ids = rows.map((row) => row.id);
  const [catalog, notesResult] = await Promise.all([
    services(),
    ids.length
      ? supabase.from('request_notes').select('*').in('request_id', ids).order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);
  const notes = check(notesResult, 'تعذر تحميل ملاحظات الطلبات.');
  const serviceById = new Map(catalog.map((service) => [service.id, service]));
  const notesByRequest = new Map();
  for (const note of notes) {
    const list = notesByRequest.get(note.request_id) || [];
    list.push(note);
    notesByRequest.set(note.request_id, list);
  }
  return rows.map((row) => {
    const rowNotes = notesByRequest.get(row.id) || [];
    const stage = rowNotes.reduce((latest, note) => (
      note.stage === null ? latest : note.stage
    ), 0);
    return {
      ...row,
      _id: row.id,
      code: `REQ-${row.id.slice(0, 8).toUpperCase()}`,
      client: row.clients ? publicClient(row.clients) : null,
      service: serviceById.get(row.category) || { name: row.title, _id: row.category },
      status: REQUEST_STATUS_FROM_DB[row.status] || row.status,
      stage,
      notes: rowNotes.filter((note) => note.note).map((note) => ({
        by: note.user_id,
        text: note.note,
        at: note.created_at,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
};

const mapDocument = (row, userId) => ({
  _id: row.id,
  client: row.client_id,
  name: row.file_name,
  storagePath: row.storage_path,
  mime: row.mime_type,
  size: row.file_size,
  direction: row.uploaded_by === userId ? 'from_client' : 'from_office',
  status: row.status === 'active' ? 'ready' : 'pending',
  uploadedBy: row.uploaded_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getDocuments = async (params) => {
  const user = await sessionUser();
  let query = supabase
    .from('documents')
    .select('id, client_id, uploaded_by, file_name, storage_path, document_type, mime_type, file_size, status, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (params.get('client')) query = query.eq('client_id', params.get('client'));
  const rows = check(await query, 'تعذر تحميل المستندات.');
  return rows.map((row) => mapDocument(row, user.id));
};

const signedDocumentUrl = async (documentId) => {
  const result = await supabase
    .from('documents')
    .select('file_name, storage_path')
    .eq('id', documentId)
    .single();
  const fileRecord = check(result, 'المستند غير موجود أو لا تملك صلاحية الوصول إليه.');
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(fileRecord.storage_path, 60);
  const { signedUrl } = check(signed, 'تعذر تجهيز رابط آمن لتنزيل المستند.');
  const response = await fetch(signedUrl);
  if (!response.ok) fail('تعذر تنزيل المستند من التخزين الآمن.');
  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileRecord.file_name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};

const extensionOf = (name) => name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

const hasOfficePackagePart = async (file, requiredPart) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 65_557);
  let endOfDirectory = -1;
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfDirectory = offset;
      break;
    }
  }
  if (endOfDirectory < 0) return false;
  const entryCount = view.getUint16(endOfDirectory + 10, true);
  let offset = view.getUint32(endOfDirectory + 16, true);
  if (!entryCount || entryCount > 5000 || offset >= bytes.length) return false;
  const decoder = new TextDecoder();
  const entries = new Set();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return false;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd > bytes.length) return false;
    entries.add(decoder.decode(bytes.subarray(offset + 46, nameEnd)));
    offset = nameEnd + extraLength + commentLength;
    if (offset > bytes.length) return false;
  }
  return entries.has('[Content_Types].xml') && entries.has(requiredPart);
};

const validateFile = async (file) => {
  if (!file || typeof file === 'string' || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    fail('حجم الملف غير مقبول. الحد الأقصى 10MB.');
  }
  const extension = extensionOf(file.name);
  if (!ALLOWED_FILES.get(file.type)?.includes(extension)) {
    fail('نوع الملف غير مسموح. استخدم PDF أو JPG أو PNG أو DOCX أو XLSX.');
  }
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signatures = {
    '.pdf': bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46,
    '.jpg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    '.png': bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
    '.docx': bytes[0] === 0x50 && bytes[1] === 0x4b,
    '.xlsx': bytes[0] === 0x50 && bytes[1] === 0x4b,
  };
  if (!signatures[extension]) fail('محتوى الملف لا يطابق امتداده.');
  if (extension === '.docx' && !(await hasOfficePackagePart(file, 'word/document.xml'))) {
    fail('ملف Word غير صالح أو لا يطابق نوعه.');
  }
  if (extension === '.xlsx' && !(await hasOfficePackagePart(file, 'xl/workbook.xml'))) {
    fail('ملف Excel غير صالح أو لا يطابق نوعه.');
  }
};

const uploadDocument = async (form) => {
  const user = await sessionUser();
  const profile = await getProfile(user);
  if (profile.role === 'receptionist') fail('ليس لديك صلاحية رفع المستندات.');
  const file = form.get('file');
  await validateFile(file);

  let clientId;
  if (profile.role === 'client') {
    clientId = (await getMyClient()).id;
  } else {
    clientId = form.get('client');
    if (!clientId) fail('العميل مطلوب.');
    await getClient(clientId);
  }

  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-120);
  const storagePath = `${clientId}/${globalThis.crypto.randomUUID()}-${safeName}`;
  const storageResult = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  check(storageResult, 'تعذر رفع المستند إلى التخزين الآمن.');

  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch('/api/documents/finalize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId,
      fileName: file.name,
      storagePath,
      mimeType: file.type,
      fileSize: file.size,
      requestId: form.get('request') || null,
      requiredDocumentId: form.get('requiredId') || null,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) fail(result.error || 'تعذر حفظ بيانات المستند.');
  const document = result.document;
  if (!document) fail('تعذر استلام نتيجة رفع المستند من الخادم.');
  return { ...mapDocument(document, user.id), warning: result.warning || '' };
};

const invoiceStatus = (status) => INVOICE_STATUS_FROM_DB[status] || status;
const mapInvoice = (row) => ({
  ...row,
  _id: row.id,
  client: row.client_id,
  number: row.invoice_number,
  service: row.description || '',
  amount: Number(row.total),
  issueDate: row.issued_at || row.created_at,
  dueDate: row.due_date,
  status: invoiceStatus(row.status) === 'unpaid'
    && row.due_date
    && row.due_date < new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    ? 'overdue'
    : invoiceStatus(row.status),
  createdAt: row.created_at,
});

const formatAppointment = (row) => {
  const start = row.start_time?.slice(0, 8) || '00:00:00';
  return {
    ...row,
    _id: row.id,
    client: row.clients ? publicClient(row.clients) : row.client_id,
    service: { name: row.title },
    start: new Date(`${row.appointment_date}T${start}`),
    status: APPOINTMENT_STATUS_FROM_DB[row.status] || row.status,
  };
};

const localDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail('تاريخ الموعد غير صالح.');
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const timePart = `${String(date.getHours()).padStart(2, '0')}:00:00`;
  if (date.getMinutes() !== 0 || date.getSeconds() !== 0) fail('اختر موعدًا على رأس الساعة.');
  return { datePart, timePart };
};

const getAppointments = async (params) => {
  let query = supabase
    .from('appointments')
    .select('*, clients(id, user_id, full_name, email, phone, company_name)')
    .order('appointment_date')
    .order('start_time');
  if (params.get('client')) query = query.eq('client_id', params.get('client'));
  const rows = check(await query, 'تعذر تحميل المواعيد.');
  return rows.map(formatAppointment);
};

const getNotifications = async () => {
  const user = await sessionUser();
  const result = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  return check(result, 'تعذر تحميل الإشعارات.').map((row) => ({
    ...row,
    _id: row.id,
    text: [row.title, row.message].filter(Boolean).join(' — '),
    link: row.type === 'request' ? '/requests' : row.type === 'appointment' ? '/portal/appointments' : '/portal',
    read: row.is_read,
    createdAt: row.created_at,
  }));
};

const getMessages = async (params) => {
  const user = await sessionUser();
  const profile = await getProfile(user);
  let clientId = params.get('client');
  if (profile.role === 'client') clientId = (await getMyClient()).id;
  if (!clientId) fail('العميل مطلوب.');
  const conversationId = check(await supabase.rpc('ensure_client_conversation', {
    p_client_id: clientId,
  }), 'تعذر فتح المحادثة.');
  const result = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, message, is_read, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  const rows = check(result, 'تعذر تحميل الرسائل.');
  return rows.map((row) => ({
    ...row,
    _id: row.id,
    body: row.message,
    sender: row.sender_id,
    fromOffice: row.sender_id !== user.id,
    createdAt: row.created_at,
  }));
};

const adminStats = async () => {
  const [clients, requests, documents, required, invoices, appointments] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('requests').select('id, status, created_at'),
    supabase.from('documents').select('id', { count: 'exact', head: true }),
    supabase.from('required_documents').select('id', { count: 'exact', head: true }).eq('fulfilled', false),
    supabase.from('invoices').select('id, status, due_date'),
    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .in('status', ['scheduled', 'confirmed'])
      .gte('appointment_date', new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })),
  ]);
  check(clients, 'تعذر تحميل إحصاءات المكتب.');
  const requestRowsData = check(requests, 'تعذر تحميل إحصاءات المكتب.');
  check(documents, 'تعذر تحميل إحصاءات المكتب.');
  check(required, 'تعذر تحميل إحصاءات المكتب.');
  const invoiceRows = check(invoices, 'تعذر تحميل إحصاءات المكتب.');
  check(appointments, 'تعذر تحميل إحصاءات المكتب.');
  const monthlyCounts = new Map();
  const byStatus = new Map();
  for (const row of requestRowsData) {
    const month = row.created_at.slice(0, 7);
    monthlyCounts.set(month, (monthlyCounts.get(month) || 0) + 1);
    byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
  }
  const monthly = [...monthlyCounts].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
    .map(([_id, n]) => ({ _id, n }));
  return {
    clients: clients.count,
    activeRequests: requestRowsData.filter((row) => ['pending', 'in_progress', 'waiting_for_client'].includes(row.status)).length,
    pendingRequests: byStatus.get('pending') || 0,
    completedRequests: byStatus.get('completed') || 0,
    documents: documents.count,
    pendingDocuments: required.count,
    unpaidInvoices: invoiceRows.filter((row) => ['draft', 'issued', 'pending', 'overdue'].includes(row.status)
      || (row.status !== 'paid' && row.due_date && row.due_date < new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()))).length,
    upcomingAppointments: appointments.count,
    byStatus: [...byStatus].map(([_id, n]) => ({ _id, n })),
    monthly,
  };
};

const listClients = async (search = '') => {
  const result = await supabase
    .from('clients')
    .select('id, user_id, full_name, email, phone, company_name, address, status, created_at')
    .order('created_at', { ascending: false });
  const rows = check(result, 'تعذر تحميل قائمة العملاء.').map(publicClient);
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((client) => [
    client.name, client.email, client.phone, client.company,
  ].some((value) => value?.toLocaleLowerCase().includes(needle)));
};

const profileForClient = async (clientId) => {
  const client = await getClient(clientId);
  return publicClient(client);
};

const createRequest = async (body) => {
  const user = await sessionUser();
  await getMyClient();
  const catalog = await services();
  const service = catalog.find((item) => item.id === body.service);
  if (!service) fail('الخدمة غير متاحة.');
  const result = await supabase.rpc('create_client_request', {
    p_title: service.name,
    p_description: body.description,
    p_service_id: service.id,
  });
  const row = check(result, 'تعذر إنشاء الطلب.');
  const client = await getMyClient();
  return {
    ...row,
    _id: row.id,
    code: `REQ-${row.id.slice(0, 8).toUpperCase()}`,
    client: publicClient(client),
    service,
    stage: 0,
    notes: [],
    createdAt: row.created_at,
    requestedBy: user.id,
  };
};

const patchRequest = async (requestId, body) => {
  const user = await sessionUser();
  const profile = await getProfile(user);
  if (!['super_admin', 'accountant'].includes(profile.role)) {
    fail('ليس لديك صلاحية تحديث الطلبات.');
  }
  const result = await supabase.rpc('manage_staff_request', {
    p_request_id: requestId,
    p_status: body.status ? (REQUEST_STATUS_TO_DB[body.status] || body.status) : null,
    p_stage: body.stage ?? null,
    p_note: body.note || null,
  });
  check(result, 'تعذر تحديث الطلب.');
  await logActivity({
    action: 'request.update',
    entityType: 'request',
    entityId: requestId,
    description: body.note || null,
    metadata: { status: body.status, stage: body.stage },
  });
  return { ok: true };
};

const addRequiredDocument = async (requestId, body) => {
  const requestResult = await supabase
    .from('requests')
    .select('id, client_id')
    .eq('id', requestId)
    .single();
  const request = check(requestResult, 'الطلب غير موجود.');
  const result = await supabase.from('required_documents').insert({
    client_id: request.client_id,
    request_id: request.id,
    title: body.title,
  }).select('*').single();
  const row = check(result, 'تعذر تسجيل المستند المطلوب.');
  const client = await getClient(request.client_id);
  if (client.user_id) {
    check(await supabase.from('notifications').insert({
      user_id: client.user_id,
      title: 'مستند مطلوب',
      message: body.title,
      type: 'document',
    }), 'تم تسجيل المستند المطلوب، لكن تعذر إرسال الإشعار.');
  }
  return { ...row, _id: row.id, createdAt: row.created_at };
};

const getRequiredDocuments = async (params) => {
  let query = supabase.from('required_documents')
    .select('id, client_id, request_id, title, fulfilled, document_id, created_at')
    .eq('fulfilled', false)
    .order('created_at', { ascending: false });
  if (params.get('client')) query = query.eq('client_id', params.get('client'));
  const rows = check(await query, 'تعذر تحميل المستندات المطلوبة.');
  return rows.map((row) => ({ ...row, _id: row.id, createdAt: row.created_at }));
};

const createInvoice = async (body) => {
  const profile = await getProfile(await sessionUser());
  if (!['super_admin', 'accountant'].includes(profile.role)) {
    fail('ليس لديك صلاحية إنشاء الفواتير.');
  }
  const result = await supabase.rpc('create_staff_invoice', {
    p_client_id: body.client,
    p_description: body.service,
    p_amount: Number(body.amount),
    p_due_date: body.dueDate,
  });
  const row = check(result, 'تعذر إنشاء الفاتورة.');
  await logActivity({
    action: 'invoice.create',
    entityType: 'invoice',
    entityId: row.id,
    description: row.description,
    metadata: { total: row.total, client_id: row.client_id },
  });
  return mapInvoice(row);
};

const markInvoicePaid = async (invoiceId) => {
  const profile = await getProfile(await sessionUser());
  if (!['super_admin', 'accountant'].includes(profile.role)) {
    fail('ليس لديك صلاحية تحديث الفواتير.');
  }
  const result = await supabase.rpc('mark_staff_invoice_paid', {
    p_invoice_id: invoiceId,
  });
  const row = check(result, 'تعذر تحديث الفاتورة.');
  await logActivity({
    action: 'invoice.paid',
    entityType: 'invoice',
    entityId: row.id,
    metadata: { client_id: row.client_id },
  });
  return mapInvoice(row);
};

const createAppointment = async (body) => {
  const profile = await getProfile(await sessionUser());
  const catalog = await services();
  const service = catalog.find((item) => item.id === body.service);
  if (!service) fail('الخدمة غير متاحة.');
  const { datePart, timePart } = localDateTime(body.start);
  const result = await supabase.rpc('book_client_appointment', {
    p_client_id: profile.role === 'client' ? null : body.client,
    p_title: service.name,
    p_description: null,
    p_appointment_date: datePart,
    p_start_time: timePart,
  });
  const row = check(result, 'الموعد غير متاح أو محجوز بالفعل.');
  return formatAppointment(row);
};

const updateAppointment = async (appointmentId, body, action) => {
  let result;
  if (action === 'cancel') {
    result = await supabase.rpc('manage_client_appointment', {
      p_appointment_id: appointmentId,
      p_action: 'cancel',
      p_appointment_date: null,
      p_start_time: null,
    });
  } else if (body.status === 'done') {
    result = await supabase.rpc('manage_client_appointment', {
      p_appointment_id: appointmentId,
      p_action: 'complete',
      p_appointment_date: null,
      p_start_time: null,
    });
  } else {
    const { datePart, timePart } = localDateTime(body.start);
    result = await supabase.rpc('manage_client_appointment', {
      p_appointment_id: appointmentId,
      p_action: 'reschedule',
      p_appointment_date: datePart,
      p_start_time: timePart,
    });
  }
  return formatAppointment(check(result, 'تعذر تحديث الموعد.'));
};

const loadClientBundle = async (clientId, profile) => {
  const client = await profileForClient(clientId);
  if (profile.role === 'receptionist') {
    return {
      user: client,
      appointments: await getAppointments(new URLSearchParams({ client: clientId })),
    };
  }
  return { user: client };
};

const updateClient = async (clientId, body) => {
  const profile = await getProfile(await sessionUser());
  if (!['super_admin', 'accountant', 'receptionist'].includes(profile.role)) {
    fail('ليس لديك صلاحية تحديث بيانات العملاء.');
  }
  const result = await supabase.from('clients').update({
    full_name: body.name,
    phone: body.phone || null,
    company_name: body.company || null,
    address: body.address || null,
    updated_at: new Date().toISOString(),
  }).eq('id', clientId).select('*').single();
  const row = check(result, 'تعذر حفظ بيانات العميل.');
  await logActivity({
    action: 'client.update',
    entityType: 'client',
    entityId: clientId,
  });
  return publicClient(row);
};

const saveOwnProfile = async (body) => {
  const result = await supabase.rpc('update_my_client_profile', {
    p_full_name: body.name || null,
    p_phone: body.phone || null,
    p_company_name: body.company || null,
    p_address: body.address || null,
  });
  const client = check(result, 'تعذر حفظ بيانات الملف الشخصي.');
  const profile = await getProfile(await sessionUser());
  return {
    ...profile,
    name: client.full_name,
    phone: client.phone,
    company: client.company_name,
    address: client.address,
  };
};

const createMessage = async (body, clientId) => {
  const user = await sessionUser();
  const profile = await getProfile(user);
  const selectedClient = profile.role === 'client' ? (await getMyClient()).id : clientId;
  if (!selectedClient) fail('العميل مطلوب.');
  const conversationId = check(await supabase.rpc('ensure_client_conversation', {
    p_client_id: selectedClient,
  }), 'تعذر فتح المحادثة.');
  const result = await supabase.rpc('create_conversation_message', {
    p_conversation_id: conversationId,
    p_message: body.body,
  });
  const row = check(result, 'تعذر إرسال الرسالة.');
  return {
    ...row,
    _id: row.id,
    body: row.message,
    sender: row.sender_id,
    fromOffice: profile.role !== 'client',
    createdAt: row.created_at,
  };
};

export const api = async (path, { method = 'GET', body, form } = {}) => {
  const url = new URL(path, window.location.origin);
  const pathname = url.pathname.replace(/^\/api/, '');
  const params = url.searchParams;
  const upperMethod = method.toUpperCase();

  if (pathname === '/services' && upperMethod === 'GET') return services();
  if (pathname === '/me' && upperMethod === 'GET') {
    const profile = await getProfile(await sessionUser());
    const clientResult = await supabase.from('clients')
      .select('company_name, address').eq('user_id', profile.id).maybeSingle();
    if (clientResult.error) cleanDatabaseError(clientResult.error, 'تعذر تحميل بيانات الملف الشخصي.');
    return {
      ...profile,
      name: profile.name,
      company: clientResult.data?.company_name || '',
      address: clientResult.data?.address || '',
    };
  }
  if (pathname === '/me' && upperMethod === 'PUT') return saveOwnProfile(body);
  if (pathname === '/requests' && upperMethod === 'GET') return requestRows(params);
  if (pathname === '/requests' && upperMethod === 'POST') return createRequest(body);
  const requiredMatch = pathname.match(/^\/requests\/([^/]+)\/required-docs$/);
  if (requiredMatch && upperMethod === 'POST') return addRequiredDocument(requiredMatch[1], body);
  const requestMatch = pathname.match(/^\/requests\/([^/]+)$/);
  if (requestMatch && upperMethod === 'PATCH') return patchRequest(requestMatch[1], body);
  if (pathname === '/required-docs' && upperMethod === 'GET') return getRequiredDocuments(params);
  if (pathname === '/documents' && upperMethod === 'GET') return getDocuments(params);
  if (pathname === '/documents' && upperMethod === 'POST') return uploadDocument(form);
  const documentMatch = pathname.match(/^\/documents\/([^/]+)\/download$/);
  if (documentMatch && upperMethod === 'GET') return signedDocumentUrl(documentMatch[1]);
  if (pathname === '/invoices' && upperMethod === 'GET') {
    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (params.get('client')) query = query.eq('client_id', params.get('client'));
    return check(await query, 'تعذر تحميل الفواتير.').map(mapInvoice);
  }
  if (pathname === '/invoices' && upperMethod === 'POST') return createInvoice(body);
  const paidInvoiceMatch = pathname.match(/^\/invoices\/([^/]+)\/paid$/);
  if (paidInvoiceMatch && upperMethod === 'PATCH') return markInvoicePaid(paidInvoiceMatch[1]);
  if (pathname === '/appointments' && upperMethod === 'GET') return getAppointments(params);
  if (pathname === '/appointments/taken' && upperMethod === 'GET') {
    const rows = check(await supabase.rpc('get_booked_appointment_slots'), 'تعذر تحميل الأوقات المحجوزة.');
    return rows.map((row) => new Date(`${row.appointment_date}T${row.start_time}`).toISOString());
  }
  if (pathname === '/appointments' && upperMethod === 'POST') return createAppointment(body);
  const cancelAppointmentMatch = pathname.match(/^\/appointments\/([^/]+)\/cancel$/);
  if (cancelAppointmentMatch && upperMethod === 'PATCH') {
    return updateAppointment(cancelAppointmentMatch[1], {}, 'cancel');
  }
  const appointmentMatch = pathname.match(/^\/appointments\/([^/]+)$/);
  if (appointmentMatch && upperMethod === 'PATCH') {
    return updateAppointment(appointmentMatch[1], body);
  }
  if (pathname === '/notifications' && upperMethod === 'GET') return getNotifications();
  if (pathname === '/notifications/read' && upperMethod === 'PATCH') {
    const user = await sessionUser();
    const result = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    check(result, 'تعذر تحديث الإشعارات.');
    return { ok: true };
  }
  if (pathname === '/messages' && upperMethod === 'GET') return getMessages(params);
  if (pathname === '/messages' && upperMethod === 'POST') return createMessage(body, params.get('client'));
  if (pathname === '/admin/stats' && upperMethod === 'GET') return adminStats();
  if (pathname === '/admin/clients' && upperMethod === 'GET') return listClients(params.get('search') || '');
  const clientMatch = pathname.match(/^\/admin\/clients\/([^/]+)$/);
  if (clientMatch && upperMethod === 'GET') {
    return loadClientBundle(clientMatch[1], await getProfile(await sessionUser()));
  }
  if (clientMatch && upperMethod === 'PUT') return updateClient(clientMatch[1], body);
  if (pathname === '/admin/staff' && upperMethod === 'POST') {
    const response = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) fail(data.error || 'تعذر إنشاء حساب الموظف.');
    return data;
  }

  fail('هذه العملية غير مدعومة.');
};

export const download = async (id) => signedDocumentUrl(id);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export const downloadInvoice = (invoice) => {
  const issued = new Date(invoice.issueDate).toLocaleDateString('ar-EG');
  const due = new Date(invoice.dueDate).toLocaleDateString('ar-EG');
  const amount = Number(invoice.amount).toLocaleString('ar-EG', { style: 'currency', currency: 'EGP' });
  const status = { unpaid: 'غير مدفوعة', paid: 'مدفوعة', overdue: 'متأخرة' }[invoice.status] || invoice.status;
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>فاتورة ${escapeHtml(invoice.number)}</title>
<style>body{font:18px Arial,sans-serif;color:#071a49;max-width:760px;margin:48px auto;padding:24px}header{border-bottom:3px solid #c99a28;padding-bottom:18px}h1{font-size:30px}dl{display:grid;grid-template-columns:1fr 2fr;gap:16px}dt{color:#526373}dd{margin:0;font-weight:bold}.amount{margin-top:40px;padding:24px;background:#f8f9fc;font-size:26px;font-weight:bold}@media print{body{margin:0}}</style>
<body><header><h1>فاتورة ${escapeHtml(invoice.number)}</h1><p>Y GROUP للمحاسبة والمراجعة والأعمال القانونية</p></header>
<dl><dt>الخدمة</dt><dd>${escapeHtml(invoice.service)}</dd><dt>تاريخ الإصدار</dt><dd>${issued}</dd><dt>تاريخ الاستحقاق</dt><dd>${due}</dd><dt>الحالة</dt><dd>${escapeHtml(status)}</dd></dl>
<p class="amount">الإجمالي: ${amount}</p><p>للاستفسار، يرجى التواصل مع المكتب.</p></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${invoice.number}.html`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
