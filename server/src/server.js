import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { fileTypeFromBuffer } from 'file-type';
import yauzl from 'yauzl';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLIENT_URL, PORT } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server.');
}

if (!CLIENT_URL) {
  throw new Error('CLIENT_URL must be set on the server.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const app = express();

const authenticateToken = async (token) => {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile) return null;
  return { user: authData.user, profile };
};

const hasOfficeParts = (buffer, requiredPart) => new Promise((resolve, reject) => {
  yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    const entries = new Set();
    let count = 0;
    let settled = false;
    const finish = (valid) => {
      if (settled) return;
      settled = true;
      zip.close();
      resolve(valid);
    };
    zip.on('error', reject);
    zip.on('entry', (entry) => {
      count += 1;
      entries.add(entry.fileName);
      if (entries.has('[Content_Types].xml') && entries.has(requiredPart)) {
        return finish(true);
      }
      if (count >= 5000) return finish(false);
      zip.readEntry();
    });
    zip.on('end', () => finish(entries.has('[Content_Types].xml') && entries.has(requiredPart)));
    zip.readEntry();
  });
});

const validateDocument = async ({ fileName, mimeType, buffer }) => {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  const expectedMime = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[extension];
  if (!expectedMime || mimeType !== expectedMime || buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
    return false;
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (['.pdf', '.jpg', '.jpeg', '.png'].includes(extension)) {
    return detected?.mime === expectedMime;
  }
  const requiredPart = extension === '.docx' ? 'word/document.xml' : 'xl/workbook.xml';
  return ['application/zip', expectedMime].includes(detected?.mime)
    && await hasOfficeParts(buffer, requiredPart);
};

const deleteUploadedObject = async (storagePath) => {
  const { error } = await supabase.storage.from('client-documents').remove([storagePath]);
  if (error) console.error('A failed private upload needs storage cleanup.');
  return !error;
};

const deleteDocumentRecord = async (documentId) => {
  const { error } = await supabase.from('documents').delete().eq('id', documentId);
  if (error) console.error('A failed document finalization needs metadata cleanup.');
  return !error;
};

app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/admin/staff', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/documents/finalize', async (req, res) => {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول.' });

  try {
    const identity = await authenticateToken(token);
    if (!identity) return res.status(401).json({ error: 'يرجى تسجيل الدخول مرة أخرى.' });

    const { user, profile } = identity;
    const { clientId, fileName, storagePath, mimeType, fileSize, requestId, requiredDocumentId } = req.body;
    let linkedRequestId = requestId || null;
    const name = typeof fileName === 'string' ? fileName.trim() : '';
    if (typeof clientId !== 'string' || typeof storagePath !== 'string'
      || !name || name.length > 255 || name.includes('/') || name.includes('\\')
      || storagePath.length > 512 || storagePath.includes('..')
      || storagePath.split('/')[0] !== clientId
      || (requestId && !/^[0-9a-f-]{36}$/i.test(requestId))
      || (requiredDocumentId && !/^[0-9a-f-]{36}$/i.test(requiredDocumentId))) {
      return res.status(400).json({ error: 'بيانات المستند غير صالحة.' });
    }

    if (profile.role === 'receptionist'
      || (profile.role !== 'client' && !['super_admin', 'accountant'].includes(profile.role))) {
      return res.status(403).json({ error: 'ليس لديك صلاحية رفع المستندات.' });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id')
      .eq('id', clientId)
      .single();
    if (clientError || !client
      || (profile.role === 'client' && client.user_id !== user.id)) {
      return res.status(403).json({ error: 'العميل أو المستند غير مصرح به.' });
    }

    if (requestId) {
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .select('id')
        .eq('id', requestId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (requestError || !request) {
        await deleteUploadedObject(storagePath);
        return res.status(400).json({ error: 'الطلب المحدد لا يخص هذا العميل.' });
      }
    }

    if (requiredDocumentId) {
      const { data: required, error: requiredError } = await supabase
        .from('required_documents')
        .select('id, request_id')
        .eq('id', requiredDocumentId)
        .eq('client_id', clientId)
        .eq('fulfilled', false)
        .maybeSingle();
      if (requiredError || !required) {
        await deleteUploadedObject(storagePath);
        return res.status(400).json({ error: 'المستند المطلوب غير صالح أو مستوفى بالفعل.' });
      }
      if (requestId && requestId !== required.request_id) {
        await deleteUploadedObject(storagePath);
        return res.status(400).json({ error: 'المستند المطلوب لا ينتمي إلى الطلب المحدد.' });
      }
      linkedRequestId ||= required.request_id;
    }

    if (linkedRequestId) {
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .select('id')
        .eq('id', linkedRequestId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (requestError || !request) {
        await deleteUploadedObject(storagePath);
        return res.status(400).json({ error: 'الطلب المحدد لا يخص هذا العميل.' });
      }
    }

    const { data: download, error: downloadError } = await supabase
      .storage.from('client-documents').download(storagePath);
    if (downloadError || !download) {
      await deleteUploadedObject(storagePath);
      return res.status(400).json({ error: 'تعذر التحقق من الملف الخاص المرفوع.' });
    }

    const buffer = Buffer.from(await download.arrayBuffer());
    if (Number(fileSize) !== buffer.length
      || !await validateDocument({ fileName: name, mimeType, buffer })) {
      const removed = await deleteUploadedObject(storagePath);
      return res.status(removed ? 400 : 500).json({
        error: removed
          ? 'محتوى الملف غير صالح أو لا يطابق نوعه المعلن.'
          : 'تم رفض الملف لكن تعذر تنظيف الرفع الخاص؛ يرجى التواصل مع المكتب.',
      });
    }

    const extension = name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        client_id: clientId,
        uploaded_by: user.id,
        file_name: name,
        storage_path: storagePath,
        document_type: extension.slice(1),
        mime_type: mimeType,
        file_size: buffer.length,
        status: 'active',
      })
      .select('*')
      .single();
    if (documentError || !document) {
      const removed = await deleteUploadedObject(storagePath);
      return res.status(500).json({
        error: removed
          ? 'تعذر حفظ بيانات المستند.'
          : 'تعذر حفظ بيانات المستند وتنظيف الرفع الخاص؛ يرجى التواصل مع المكتب.',
      });
    }

    if (linkedRequestId) {
      const { error: linkError } = await supabase.from('document_requests').insert({
        document_id: document.id,
        request_id: linkedRequestId,
        client_id: clientId,
      });
      if (linkError) {
        const [recordRemoved, objectRemoved] = await Promise.all([
          deleteDocumentRecord(document.id),
          deleteUploadedObject(storagePath),
        ]);
        return res.status(500).json({
          error: recordRemoved && objectRemoved
            ? 'تعذر ربط المستند بالطلب.'
            : 'تعذر ربط المستند وتنظيف الرفع الخاص؛ يرجى التواصل مع المكتب.',
        });
      }
    }

    if (requiredDocumentId) {
      const requiredUpdate = await supabase
        .from('required_documents')
        .update({ fulfilled: true, document_id: document.id, updated_at: new Date().toISOString() })
        .eq('id', requiredDocumentId)
        .eq('client_id', clientId)
        .eq('fulfilled', false)
        .select('id')
        .maybeSingle();
      if (requiredUpdate.error || !requiredUpdate.data) {
        const [recordRemoved, objectRemoved] = await Promise.all([
          deleteDocumentRecord(document.id),
          deleteUploadedObject(storagePath),
        ]);
        return res.status(500).json({
          error: recordRemoved && objectRemoved
            ? 'تعذر تسجيل المستند المطلوب.'
            : 'تعذر تسجيل المستند وتنظيف الرفع الخاص؛ يرجى التواصل مع المكتب.',
        });
      }
    }

    let warning;
    const notificationTargets = profile.role === 'client'
      ? (await supabase.from('profiles').select('id').in('role', ['super_admin', 'accountant', 'receptionist']))
      : { data: client.user_id ? [{ id: client.user_id }] : [], error: null };
    const notificationRows = (notificationTargets.data || []).map((target) => ({
      user_id: target.id,
      title: profile.role === 'client' ? 'مستند عميل جديد' : 'تم رفع مستند إلى حسابك',
      message: name,
      type: 'document',
    }));
    if (notificationTargets.error || (notificationRows.length
      && (await supabase.from('notifications').insert(notificationRows)).error)) {
      warning = 'تم رفع المستند، لكن تعذر إرسال إشعار به.';
    }

    if (profile.role !== 'client') {
      const { error: logError } = await supabase.from('activity_logs').insert({
        user_id: user.id,
        action: 'document.upload',
        entity_type: 'document',
        entity_id: document.id,
        description: name,
        metadata: { client_id: clientId },
      });
      if (logError) warning = 'تم رفع المستند، لكن تعذر حفظ سجل النشاط.';
    }

    return res.status(201).json({ document, warning });
  } catch (error) {
    console.error('Document finalization failed.', error);
    return res.status(500).json({ error: 'تعذر إتمام رفع المستند بأمان.' });
  }
});

app.post('/api/admin/staff', async (req, res) => {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول.' });

  try {
    const identity = await authenticateToken(token);
    if (!identity) return res.status(401).json({ error: 'يرجى تسجيل الدخول مرة أخرى.' });
    const { user, profile } = identity;
    if (profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'هذه العملية متاحة للمدير العام فقط.' });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    const role = req.body.role;
    if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || password.length < 12 || password.length > 128
      || !['accountant', 'receptionist'].includes(role)
      || phone.length > 40) {
      return res.status(400).json({ error: 'بيانات الموظف غير صالحة.' });
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, phone: phone || null },
    });
    if (createError || !created.user) {
      const duplicate = createError?.message?.toLowerCase().includes('already');
      return res.status(duplicate ? 409 : 400).json({
        error: duplicate ? 'البريد الإلكتروني مسجل بالفعل.' : 'تعذر إنشاء حساب الموظف.',
      });
    }

    const { error: removeClientError } = await supabase
      .from('clients')
      .delete()
      .eq('user_id', created.user.id);
    if (removeClientError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: 'تعذر إعداد سجل الموظف بأمان.' });
    }

    const { error: roleError } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', created.user.id);
    if (roleError) {
      await supabase.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: 'تعذر تعيين صلاحية الموظف.' });
    }

    const { error: logError } = await supabase.from('activity_logs').insert({
      user_id: user.id,
      action: 'staff.create',
      entity_type: 'profile',
      entity_id: created.user.id,
      description: 'Staff account created',
      metadata: { role },
    });
    if (logError) {
      console.error('Staff account created but activity logging failed.');
      await supabase.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: 'تم إنشاء الحساب، لكن تعذر حفظ سجل النشاط.' });
    }

    return res.status(201).json({ id: created.user.id, role });
  } catch (error) {
    console.error('Staff provisioning failed.', error);
    return res.status(500).json({ error: 'حدث خطأ في الخادم.' });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled server error.');
  if (res.headersSent) return;
  return res.status(500).json({ error: 'حدث خطأ في الخادم.' });
});

app.listen(Number(PORT) || 5000, () => console.log('Staff provisioning API ready.'));
