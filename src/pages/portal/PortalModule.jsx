import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bell, CalendarDays, Download, FileText, MessageCircle, Send, Settings, Upload, ClipboardList, ListChecks } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useLang } from '../../i18n/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useOfficeSettings } from '../../config/OfficeSettingsContext'
import { useServices } from '../../config/ServicesContext'

const FILE_LIMIT = 20 * 1024 * 1024
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
])
const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'])
const STATUS_OPTIONS = {
  documents: ['received', 'under_review', 'need_information', 'completed'],
  appointments: ['pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'declined', 'cancelled', 'completed'],
  requests: ['pending', 'in_review', 'need_information', 'completed', 'declined'],
}
const MODULE_ICONS = { documents: FileText, appointments: CalendarDays, requests: ClipboardList, messages: MessageCircle, notifications: Bell, settings: Settings, activity: ListChecks }
const TABLES = { documents: 'documents', appointments: 'appointments', requests: 'service_requests', notifications: 'notifications', activity: 'activity_logs' }
const fileKey = (name) => name.replace(/[^\w.-]/g, '_').slice(-100) || 'document'
const officeWallTimeToIso = (value, timezone) => {
  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  let timestamp = desired
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    timestamp += desired - represented
  }
  return new Date(timestamp).toISOString()
}
const dateInTimezone = (date, timezone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const officeIsoToWallTime = (iso, timezone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
const nextDate = (date) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}
const findAvailabilitySlot = (value, availability) => {
  if (!value) return null
  const [day, time] = value.split('T')
  if (!day || !time) return null
  const weekday = new Date(`${day}T00:00:00`).getDay()
  const [hours, minutes] = time.split(':').map(Number)
  const start = hours * 60 + minutes
  return availability.find((entry) => {
    const [openingHour, openingMinute] = entry.start_time.split(':').map(Number)
    const [closingHour, closingMinute] = entry.end_time.split(':').map(Number)
    const opening = openingHour * 60 + openingMinute
    const closing = closingHour * 60 + closingMinute
    const end = start + entry.slot_minutes
    const [breakStartHour, breakStartMinute] = (entry.break_start || '').split(':').map(Number)
    const [breakEndHour, breakEndMinute] = (entry.break_end || '').split(':').map(Number)
    const breakStart = entry.break_start ? breakStartHour * 60 + breakStartMinute : null
    const breakEnd = entry.break_end ? breakEndHour * 60 + breakEndMinute : null
    const overlapsBreak = breakStart !== null && end > breakStart && start < breakEnd
    return entry.weekday === weekday && entry.is_active && start >= opening
      && end <= closing && (start - opening) % entry.slot_minutes === 0 && !overlapsBreak
  })
}

export default function PortalModule({ kind }) {
  const { t, lang } = useLang()
  const { user, isStaff, isAdminLevel } = useAuth()
  const { refresh: refreshOfficeSettings } = useOfficeSettings()
  const { refresh: refreshServices } = useServices()
  const [searchParams] = useSearchParams()
  const isAdmin = isStaff
  const [items, setItems] = useState([])
  const [services, setServices] = useState([])
  const [clients, setClients] = useState([])
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [settings, setSettings] = useState({})
  const [availability, setAvailability] = useState([])
  const [bookedAppointments, setBookedAppointments] = useState([])
  const [form, setForm] = useState({
    title: '', service_code: searchParams.get('service') || '', starts_at: '',
    business_activity: '', description: '', body: '',
  })
  const [file, setFile] = useState(null)
  const [activeConversation, setActiveConversation] = useState('')
  const [rescheduleTimes, setRescheduleTimes] = useState({})
  const [calendarMode, setCalendarMode] = useState('week')
  const [calendarDate, setCalendarDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const title = t(`workspace.${kind}Title`)
  const subtitle = t(`workspace.${kind}Sub`)
  const Icon = MODULE_ICONS[kind]

  const showError = (reason) => {
    const text = reason?.message ?? ''
    const code = reason?.code ?? ''
    if (text.includes('APPOINTMENT_SLOT_UNAVAILABLE') || text.includes('APPOINTMENT_MUST_BE_FUTURE')) setError('availability')
    else if (kind === 'appointments' && (text.includes('appointments_active_slot_idx') || text.includes('appointments_no_overlap') || code === '23P01' || code === '23505')) setError('conflict')
    else if (text.includes('413') || text.toLowerCase().includes('size')) setError('fileSize')
    else setError('generic')
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (kind === 'settings') {
      const [settingsResult, availabilityResult, servicesResult] = await Promise.all([
        supabase.from('office_settings').select('key, value'),
        supabase.from('office_availability').select('*').order('weekday').order('start_time'),
        supabase.from('services').select('*').order('code'),
      ])
      if (settingsResult.error || availabilityResult.error || servicesResult.error) {
        setLoading(false)
        showError(settingsResult.error || availabilityResult.error || servicesResult.error)
        return
      }
      setSettings(Object.fromEntries(settingsResult.data.map((row) => [row.key, row.value])))
      setAvailability(availabilityResult.data)
      setServices(servicesResult.data)
      setLoading(false)
      return
    }

    if (kind === 'messages') {
      const { data, error: queryError } = await supabase.from('conversations').select('id, client_id, assigned_to, created_at').order('updated_at', { ascending: false })
      if (queryError) showError(queryError)
      else {
        let rows = data
        if (!isAdmin && rows.length === 0) setConversation(null)
        if (isAdmin && rows.length) {
          const ids = [...new Set(rows.map((row) => row.client_id))]
          const { data: people, error: peopleError } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
          if (peopleError) showError(peopleError)
          rows = rows.map((row) => ({ ...row, client: people?.find((person) => person.id === row.client_id) }))
        }
        setItems(rows)
        if (!isAdmin && rows.length) {
          setConversation(rows[0])
          setActiveConversation(rows[0].id)
        }
      }
      const { data: serviceRows, error: serviceError } = await supabase.from('services').select('code, title_ar, title_en').eq('is_active', true).order('code')
      if (serviceError) showError(serviceError)
      else setServices(serviceRows)
      if (isAdmin) {
        const { data: staffRows, error: staffError } = await supabase.from('profiles')
          .select('id, full_name, email, role').in('role', ['staff', 'office_admin', 'super_admin']).order('full_name')
        if (staffError) showError(staffError)
        else setClients(staffRows)
      }
      setLoading(false)
      return
    }

    const table = TABLES[kind]
    if (!table) {
      setLoading(false)
      return
    }
    let query = supabase.from(table).select('*')
    if (kind === 'notifications') query = query.eq('user_id', user.id)
    const { data, error: queryError } = await query.order('created_at', { ascending: false })
    if (queryError) showError(queryError)
    else setItems(data)
    if (['appointments', 'requests'].includes(kind)) {
      const { data: serviceRows, error: serviceError } = await supabase.from('services').select('code, title_ar, title_en').eq('is_active', true).order('code')
      if (serviceError) showError(serviceError)
      else setServices(serviceRows)
    }
    if (kind === 'appointments') {
      const [availabilityResult, timezoneResult] = await Promise.all([
        supabase.from('office_availability').select('*').eq('is_active', true).order('weekday').order('start_time'),
        supabase.from('office_settings').select('value').eq('key', 'timezone').maybeSingle(),
      ])
      if (availabilityResult.error || timezoneResult.error) showError(availabilityResult.error || timezoneResult.error)
      else {
        const timezone = timezoneResult.data?.value || 'UTC'
        try {
          new Intl.DateTimeFormat('en', { timeZone: timezone })
          setAvailability(availabilityResult.data)
          setSettings((value) => ({ ...value, timezone }))
        } catch { setError('generic') }
      }
    }
    if (isAdmin && ['documents', 'requests', 'appointments'].includes(kind)) {
      let peopleQuery = supabase.from('profiles').select('id, full_name, email, role')
      if (kind === 'documents' && !isAdminLevel) peopleQuery = peopleQuery.eq('role', 'client')
      if (kind === 'appointments' && !isAdminLevel) peopleQuery = peopleQuery.in('role', ['staff', 'office_admin', 'super_admin'])
      const { data: people, error: peopleError } = await peopleQuery.order('full_name')
      if (peopleError) showError(peopleError)
      else setClients(people)
    }
    setLoading(false)
  }, [isAdmin, kind, user?.id])

  useEffect(() => { load() }, [load])

  const appointmentDate = form.starts_at.split('T')[0] || ''
  const appointmentTime = form.starts_at.split('T')[1] || ''
  useEffect(() => {
    if (kind !== 'appointments' || !appointmentDate) return
    const timezone = settings.timezone || 'UTC'
    const loadBooked = async () => {
      let start
      let end
      try {
        start = officeWallTimeToIso(`${appointmentDate}T00:00`, timezone)
        end = officeWallTimeToIso(`${nextDate(appointmentDate)}T00:00`, timezone)
      } catch {
        setError('generic')
        return
      }
      const { data, error: queryError } = await supabase.from('appointments')
        .select('starts_at, ends_at, status')
        .gte('starts_at', start).lt('starts_at', end)
        .in('status', ['pending', 'confirmed', 'reschedule_requested', 'rescheduled'])
      if (queryError) showError(queryError)
      else setBookedAppointments(data)
    }
    loadBooked()
  }, [appointmentDate, kind, settings.timezone])

  const availableSlots = useMemo(() => {
    if (!appointmentDate) return []
    const weekday = new Date(`${appointmentDate}T00:00:00`).getDay()
    const slots = []
    for (const entry of availability.filter((item) => item.weekday === weekday && item.is_active)) {
      const [startHour, startMinute] = entry.start_time.split(':').map(Number)
      const [endHour, endMinute] = entry.end_time.split(':').map(Number)
      const opening = startHour * 60 + startMinute
      const closing = endHour * 60 + endMinute
      for (let start = opening; start + entry.slot_minutes <= closing; start += entry.slot_minutes) {
        const [breakStartHour, breakStartMinute] = (entry.break_start || '').split(':').map(Number)
        const [breakEndHour, breakEndMinute] = (entry.break_end || '').split(':').map(Number)
        const breakStart = entry.break_start ? breakStartHour * 60 + breakStartMinute : null
        const breakEnd = entry.break_end ? breakEndHour * 60 + breakEndMinute : null
        const end = start + entry.slot_minutes
        if (breakStart !== null && end > breakStart && start < breakEnd) continue
        const time = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`
        const endTime = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
        const startIso = officeWallTimeToIso(`${appointmentDate}T${time}`, settings.timezone || 'UTC')
        const endIso = officeWallTimeToIso(`${appointmentDate}T${endTime}`, settings.timezone || 'UTC')
        const isBooked = bookedAppointments.some((appointment) =>
          new Date(appointment.starts_at) < new Date(endIso) && new Date(appointment.ends_at) > new Date(startIso))
        if (!isBooked) slots.push(time)
      }
    }
    return slots
  }, [appointmentDate, availability, bookedAppointments, settings.timezone])

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return
    const { data, error: queryError } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at')
    if (queryError) {
      showError(queryError)
      return
    }
    const messageIds = data.map((message) => message.id)
    let attachments = []
    if (messageIds.length) {
      const { data: files, error: filesError } = await supabase.from('message_attachments').select('*').in('message_id', messageIds)
      if (filesError) showError(filesError)
      else attachments = files
    }
    setMessages(data.map((message) => ({ ...message, attachments: attachments.filter((item) => item.message_id === message.id) })))
    const unread = data.filter((message) => message.sender_id !== user.id && !message.read_at)
    for (const message of unread) {
      const { error: updateError } = await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', message.id)
      if (updateError) showError(updateError)
    }
  }, [kind, user?.id])

  useEffect(() => {
    if (kind !== 'messages' || !activeConversation) return undefined
    loadMessages(activeConversation)
    const channel = supabase.channel(`messages-${activeConversation}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversation}` }, () => loadMessages(activeConversation))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_attachments' }, () => loadMessages(activeConversation))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeConversation, kind, loadMessages])

  useEffect(() => {
    if (kind !== 'notifications') return undefined
    const channel = supabase.channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [kind, load, user?.id])

  const updateForm = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }))
  const clearAlerts = () => { setError(''); setSuccess('') }

  const uploadDocument = async (event) => {
    event.preventDefault()
    clearAlerts()
    if (!file) return setError('generic')
    if (file.size > FILE_LIMIT) return setError('fileSize')
    if (!ALLOWED_FILE_TYPES.has(file.type) && !ALLOWED_FILE_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase())) return setError('fileType')
    setBusy(true)
    const clientId = isAdmin ? form.client_id : user.id
    const path = `${clientId}/${crypto.randomUUID()}-${fileKey(file.name)}`
    const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadError) {
      setBusy(false)
      showError(uploadError)
      return
    }
    const { error: insertError } = await supabase.from('documents').insert({
      client_id: clientId,
      title: form.title.trim() || file.name,
      file_name: file.name,
      storage_path: path,
      content_type: file.type || 'application/octet-stream',
      file_size: file.size,
      status: isAdmin ? 'completed' : 'received',
      uploaded_by: user.id,
      handled_by: isAdmin ? user.id : null,
    })
    if (insertError) {
      const { error: cleanupError } = await supabase.storage.from('client-documents').remove([path])
      setBusy(false)
      showError(insertError)
      if (cleanupError) setError('generic')
      return
    }
    setBusy(false)
    setFile(null)
    setForm((value) => ({ ...value, title: '', client_id: '' }))
    setSuccess('uploadSuccess')
    load()
  }

  const rescheduleAppointment = async (row) => {
    const value = rescheduleTimes[row.id] || officeIsoToWallTime(row.starts_at, settings.timezone || 'UTC')
    const slot = findAvailabilitySlot(value, availability)
    if (!slot) { setError('availability'); return }
    const [day, time] = value.split('T')
    const [hours, minutes] = time.split(':').map(Number)
    const endMinutes = hours * 60 + minutes + slot.slot_minutes
    if (endMinutes >= 24 * 60) { setError('availability'); return }
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    try {
      await updateRecord('appointments', row.id, {
        starts_at: officeWallTimeToIso(value, settings.timezone || 'UTC'),
        ends_at: officeWallTimeToIso(`${day}T${endTime}`, settings.timezone || 'UTC'),
        status: 'rescheduled',
        assigned_to: row.assigned_to || user.id,
      })
    } catch { setError('generic') }
  }

  const downloadFile = async (bucket, path) => {
    clearAlerts()
    const { data, error: downloadError } = await supabase.storage.from(bucket).createSignedUrl(path, 60, { download: true })
    if (downloadError) { showError(downloadError); return }
    const anchor = document.createElement('a')
    anchor.href = data.signedUrl
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.click()
  }

  const updateRecord = async (table, id, updates) => {
    clearAlerts()
    const { error: updateError } = await supabase.from(table).update(updates).eq('id', id)
    if (updateError) { showError(updateError); return false }
    setSuccess('saved')
    load()
    return true
  }

  const submitAppointment = async (event) => {
    event.preventDefault()
    clearAlerts()
    if (!form.service_code || !form.starts_at) return setError('generic')
    let start
    try { start = new Date(officeWallTimeToIso(form.starts_at, settings.timezone || 'UTC')) } catch { return setError('generic') }
    const [day, time] = form.starts_at.split('T')
    const slot = findAvailabilitySlot(form.starts_at, availability)
    if (!slot) return setError('availability')
    const [, timeValue] = form.starts_at.split('T')
    const [hours, minutes] = timeValue.split(':').map(Number)
    const endMinutes = hours * 60 + minutes + slot.slot_minutes
    if (endMinutes >= 24 * 60) return setError('availability')
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    const end = new Date(officeWallTimeToIso(`${day}T${endTime}`, settings.timezone || 'UTC'))
    const { error: insertError } = await supabase.from('appointments').insert({
      client_id: user.id, service_code: form.service_code, starts_at: start.toISOString(),
      ends_at: end.toISOString(), client_note: form.description.trim(), status: 'pending',
    })
    if (insertError) { showError(insertError); return }
    setForm((value) => ({ ...value, starts_at: '', description: '' }))
    setSuccess('pendingApproval')
    load()
  }

  const submitRequest = async (event) => {
    event.preventDefault()
    clearAlerts()
    if (!form.service_code || !form.description.trim()) return setError('generic')
    const { error: insertError } = await supabase.from('service_requests').insert({
      client_id: user.id, service_code: form.service_code,
      business_activity: form.business_activity.trim(), description: form.description.trim(), status: 'pending',
    })
    if (insertError) { showError(insertError); return }
    setForm((value) => ({ ...value, business_activity: '', description: '' }))
    setSuccess('sent')
    load()
  }

  const startConversation = async () => {
    clearAlerts()
    const { data: existing, error: queryError } = await supabase.from('conversations').select('id, client_id').eq('client_id', user.id).maybeSingle()
    if (queryError) { showError(queryError); return }
    if (existing) {
      setConversation(existing)
      setActiveConversation(existing.id)
      return
    }
    const { data: created, error: insertError } = await supabase.from('conversations').insert({ client_id: user.id }).select('id, client_id').single()
    if (insertError) { showError(insertError); return }
    setConversation(created)
    setActiveConversation(created.id)
    load()
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    clearAlerts()
    if (!form.body.trim() && !file) return
    if (!activeConversation) return
    if (file && (file.size > FILE_LIMIT || (!ALLOWED_FILE_TYPES.has(file.type) && !ALLOWED_FILE_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase())))) {
      setError(file.size > FILE_LIMIT ? 'fileSize' : 'fileType')
      return
    }
    const body = form.body.trim() || `File: ${file.name}`
    const { data: sentMessage, error: sendError } = await supabase.from('messages')
      .insert({ conversation_id: activeConversation, sender_id: user.id, body })
      .select('id')
      .single()
    if (sendError) { showError(sendError); return }
    if (file) {
      const path = `${activeConversation}/${user.id}/${crypto.randomUUID()}-${fileKey(file.name)}`
      const { error: uploadError } = await supabase.storage.from('message-attachments')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (uploadError) { showError(uploadError); setForm((value) => ({ ...value, body: '' })); setFile(null); return }
      const { error: attachmentError } = await supabase.from('message_attachments').insert({
        message_id: sentMessage.id, file_name: file.name, storage_path: path,
        content_type: file.type || 'application/octet-stream', file_size: file.size,
      })
      if (attachmentError) {
        const { error: cleanupError } = await supabase.storage.from('message-attachments').remove([path])
        showError(attachmentError)
        if (cleanupError) setError('generic')
        return
      }
    }
    setForm((value) => ({ ...value, body: '' }))
    setFile(null)
    setSuccess('sent')
    loadMessages(activeConversation)
  }

  const markNotificationRead = async (id) => {
    const { error: updateError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    if (updateError) { showError(updateError); return }
    setItems((rows) => rows.map((row) => row.id === id ? { ...row, read_at: new Date().toISOString() } : row))
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    clearAlerts()
    try { new Intl.DateTimeFormat('en', { timeZone: settings.timezone }) } catch { setError('generic'); return }
    setBusy(true)
    const entries = Object.entries(settings).filter(([key]) => ['office_name', 'email', 'phone', 'address', 'timezone', 'whatsapp', 'facebook', 'map_url'].includes(key))
    for (const [key, value] of entries) {
      const { error: saveError } = await supabase.from('office_settings').upsert({ key, value, updated_by: user.id })
      if (saveError) {
        setBusy(false)
        showError(saveError)
        return
      }
    }
    if (!await refreshOfficeSettings()) {
      setBusy(false)
      setError('generic')
      return
    }
    setBusy(false)
    setSuccess('saved')
  }

  const saveService = async (service) => {
    clearAlerts()
    const { error: saveError } = await supabase.from('services')
      .update({
        title_ar: service.title_ar,
        title_en: service.title_en,
        short_ar: service.short_ar,
        short_en: service.short_en,
        details_ar: service.details_ar,
        details_en: service.details_en,
        is_active: service.is_active,
      })
      .eq('code', service.code)
    if (saveError) { showError(saveError); return }
    if (!await refreshServices()) {
      setError('generic')
      return
    }
    await load()
    setSuccess('saved')
  }

  const addAvailability = async (event) => {
    event.preventDefault()
    clearAlerts()
    const formElement = event.currentTarget
    const formData = new FormData(event.currentTarget)
    const breakStart = formData.get('break_start') || null
    const breakEnd = formData.get('break_end') || null
    if (Boolean(breakStart) !== Boolean(breakEnd)) { setError('generic'); return }
    const record = {
      weekday: Number(formData.get('weekday')),
      start_time: formData.get('start_time'),
      end_time: formData.get('end_time'),
      break_start: breakStart,
      break_end: breakEnd,
      slot_minutes: Number(formData.get('slot_minutes')),
      is_active: true,
    }
    const { error: insertError } = await supabase.from('office_availability').insert(record)
    if (insertError) { showError(insertError); return }
    formElement.reset()
    setSuccess('saved')
    load()
  }

  const servicesByCode = useMemo(() => Object.fromEntries(services.map((service) => [service.code, service])), [services])
  const displayItems = useMemo(() => {
    if (kind !== 'appointments' || !isAdmin) return items
    const timezone = settings.timezone || 'UTC'
    const selected = calendarDate || dateInTimezone(new Date(), timezone)
    const selectedDate = new Date(`${selected}T00:00:00Z`)
    let start = selected
    let end = selected
    if (calendarMode === 'week') {
      selectedDate.setUTCDate(selectedDate.getUTCDate() - selectedDate.getUTCDay())
      start = selectedDate.toISOString().slice(0, 10)
      selectedDate.setUTCDate(selectedDate.getUTCDate() + 7)
      end = selectedDate.toISOString().slice(0, 10)
    } else if (calendarMode === 'month') {
      start = `${selected.slice(0, 7)}-01`
      const monthEnd = new Date(`${start}T00:00:00Z`)
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)
      end = monthEnd.toISOString().slice(0, 10)
    } else {
      const next = new Date(`${selected}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      end = next.toISOString().slice(0, 10)
    }
    return items.filter((item) => {
      const day = officeIsoToWallTime(item.starts_at, timezone).slice(0, 10)
      return day >= start && day < end
    }).sort((left, right) => left.starts_at.localeCompare(right.starts_at))
  }, [calendarDate, calendarMode, isAdmin, items, kind, settings.timezone])
  const serviceName = (code) => {
    const service = servicesByCode[code]
    return service ? (lang === 'ar' ? service.title_ar : service.title_en) : t(`services.${code}.title`)
  }
  const statusName = (status) => t(`workspace.statuses.${status}`)

  const renderFilePicker = () => (
    <div>
      <label className="block text-sm font-semibold mb-1" htmlFor={`${kind}-file`}>{t('workspace.uploadDocument')}</label>
      <input id={`${kind}-file`} type="file" className="field" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <p className="mt-1 text-xs text-ink/60">{t('workspace.uploadLimit')}</p>
    </div>
  )

  if (!Icon) return null
  return (
    <section className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-lg bg-navy text-softgold grid place-items-center shrink-0"><Icon size={22} /></span>
        <div><h1 className="text-2xl font-extrabold text-navy">{title}</h1><p className="mt-1 text-sm text-ink/70">{subtitle}</p></div>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t(`workspace.errors.${error}`)}</p>}
      {success && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{t(`workspace.${success}`)}</p>}
      {kind === 'settings' && !isAdminLevel && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t('workspace.restricted')}</p>}

      {kind === 'documents' && (
        <form onSubmit={uploadDocument} className="bg-white rounded-xl border border-navy/10 p-5 space-y-4">
          <h2 className="font-bold text-navy">{t('workspace.upload')}</h2>
          {isAdmin && <div><label className="block text-sm font-semibold mb-1" htmlFor="document-client">{t('workspace.client')}</label>
            <select id="document-client" className="field" required value={form.client_id || ''} onChange={(event) => setForm((value) => ({ ...value, client_id: event.target.value }))}>
              <option value="">{t('workspace.client')}</option>{clients.filter((client) => client.role === 'client').map((client) => <option key={client.id} value={client.id}>{client.full_name} — {client.email}</option>)}
            </select></div>}
          <div><label className="block text-sm font-semibold mb-1" htmlFor="document-title">{t('workspace.title')}</label>
            <input id="document-title" className="field" value={form.title} onChange={updateForm('title')} /></div>
          {renderFilePicker()}
          <button className="btn btn-navy" type="submit" disabled={busy || (isAdmin && !form.client_id)}><Upload size={17} />{t('workspace.upload')}</button>
        </form>
      )}

      {kind === 'appointments' && !isAdmin && (
        <form onSubmit={submitAppointment} className="bg-white rounded-xl border border-navy/10 p-5 grid sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-semibold mb-1" htmlFor="appointment-service">{t('workspace.service')}</label>
            <select id="appointment-service" className="field" required value={form.service_code} onChange={updateForm('service_code')}>
              <option value="">{t('workspace.chooseService')}</option>{services.map((service) => <option key={service.code} value={service.code}>{serviceName(service.code)}</option>)}
            </select></div>
          <div><label className="block text-sm font-semibold mb-1" htmlFor="appointment-date">{t('workspace.dateTime')}</label>
            <input id="appointment-date" className="field" type="date" required min={dateInTimezone(new Date(), settings.timezone || 'UTC')} value={appointmentDate}
              onChange={(event) => setForm((value) => ({ ...value, starts_at: event.target.value ? `${event.target.value}T${appointmentTime}` : '' }))} />
            <select className="field mt-2" aria-label={t('workspace.dateTime')} required disabled={!appointmentDate || !availableSlots.length} value={appointmentTime}
              onChange={(event) => setForm((value) => ({ ...value, starts_at: `${appointmentDate}T${event.target.value}` }))}>
              <option value="">{availableSlots.length ? t('workspace.dateTime') : t('workspace.errors.availability')}</option>
              {availableSlots.map((time) => <option key={time} value={time}>{time}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="block text-sm font-semibold mb-1" htmlFor="appointment-note">{t('workspace.note')}</label>
            <textarea id="appointment-note" className="field" rows={3} value={form.description} onChange={updateForm('description')} /></div>
          <button className="btn btn-navy sm:col-span-2" type="submit"><CalendarDays size={17} />{t('workspace.submitAppointment')}</button>
        </form>
      )}

      {kind === 'requests' && !isAdmin && (
        <form onSubmit={submitRequest} className="bg-white rounded-xl border border-navy/10 p-5 grid sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-semibold mb-1" htmlFor="request-service">{t('workspace.service')}</label>
            <select id="request-service" className="field" required value={form.service_code} onChange={updateForm('service_code')}>
              <option value="">{t('workspace.chooseService')}</option>{services.map((service) => <option key={service.code} value={service.code}>{serviceName(service.code)}</option>)}
            </select></div>
          <div><label className="block text-sm font-semibold mb-1" htmlFor="request-business">{t('workspace.business')}</label>
            <input id="request-business" className="field" value={form.business_activity} onChange={updateForm('business_activity')} /></div>
          <div className="sm:col-span-2"><label className="block text-sm font-semibold mb-1" htmlFor="request-description">{t('workspace.description')}</label>
            <textarea id="request-description" className="field" rows={3} required value={form.description} onChange={updateForm('description')} /></div>
          <button className="btn btn-navy sm:col-span-2" type="submit"><Send size={17} />{t('workspace.submitRequest')}</button>
        </form>
      )}

      {kind === 'messages' && (
        <div className="bg-white rounded-xl border border-navy/10 overflow-hidden">
          {!isAdmin && !conversation && <div className="p-6 text-center"><p className="text-ink/70">{t('workspace.noConversation')}</p>
            <button type="button" className="btn btn-navy mt-4" onClick={startConversation}>{t('workspace.startConversation')}</button></div>}
          <div className={isAdmin ? 'grid md:grid-cols-[260px_1fr] min-h-96' : 'min-h-96'}>
            {isAdmin && <aside className="border-e border-navy/10 p-3 space-y-2 max-h-[34rem] overflow-auto">
              {items.map((row) => <button key={row.id} type="button" className={`w-full rounded-lg p-3 text-start ${activeConversation === row.id ? 'bg-paper' : 'hover:bg-paper/70'}`}
                onClick={() => { setConversation(row); setActiveConversation(row.id) }}>
                <span className="block font-bold text-navy">{row.client?.full_name || t('workspace.client')}</span>
                <span className="block text-xs text-ink/60" dir="ltr">{row.client?.email || ''}</span>
              </button>)}
              {!items.length && !loading && <p className="p-3 text-sm text-ink/60">{t('workspace.noItems')}</p>}
            </aside>}
            <div className="flex flex-col min-h-96">
              {activeConversation ? <>
                {isAdminLevel && conversation && <div className="border-b border-navy/10 p-3">
                  <label className="text-xs font-semibold text-ink/70" htmlFor="conversation-assignee">{t('workspace.assignedStaff')}</label>
                  <select id="conversation-assignee" className="field mt-1" value={conversation.assigned_to || ''} onChange={async (event) => {
                    const assigned_to = event.target.value || null
                    if (await updateRecord('conversations', conversation.id, { assigned_to })) {
                      setConversation((current) => ({ ...current, assigned_to }))
                    }
                  }}>
                    <option value="">{t('workspace.unassigned')}</option>
                    {clients.filter((person) => ['staff', 'office_admin', 'super_admin'].includes(person.role)).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                </div>}
                <div className="flex-1 max-h-[28rem] overflow-auto p-4 space-y-3">
                  {messages.map((message) => <article key={message.id} className={`max-w-[85%] rounded-xl p-3 ${message.sender_id === user.id ? 'bg-navy text-white ms-auto' : 'bg-paper text-ink'}`}>
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <div className={`mt-2 flex flex-wrap gap-2 ${message.sender_id === user.id ? 'text-white/70' : 'text-ink/50'}`}>
                      {(message.attachments || []).map((attachment) => <button key={attachment.id} className="underline text-xs" type="button" onClick={() => downloadFile('message-attachments', attachment.storage_path)}>{attachment.file_name}</button>)}
                      <time className="text-xs" dir="ltr">{new Date(message.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</time>
                    </div>
                  </article>)}
                  {!messages.length && <p className="text-center text-sm text-ink/50 py-12">{t('workspace.noItems')}</p>}
                </div>
                <form onSubmit={sendMessage} className="border-t border-navy/10 p-3 flex flex-wrap gap-2">
                  <input className="field flex-1 min-w-40" aria-label={t('workspace.messagePlaceholder')} placeholder={t('workspace.messagePlaceholder')} maxLength={10000} value={form.body} onChange={updateForm('body')} />
                  <input type="file" className="field max-w-48" aria-label={t('workspace.uploadDocument')} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                  <button className="btn btn-gold" type="submit"><Send size={17} />{t('workspace.sendMessage')}</button>
                </form>
              </> : isAdmin ? <p className="m-auto p-6 text-sm text-ink/60">{t('workspace.noConversation')}</p> : null}
            </div>
          </div>
        </div>
      )}

      {kind === 'settings' && isAdminLevel && !loading && (
        <div className="space-y-5">
          <form onSubmit={saveSettings} className="bg-white rounded-xl border border-navy/10 p-5 space-y-4">
            {[
              ['office_name', 'officeName'], ['email', 'officeEmail'], ['phone', 'officePhone'],
              ['address', 'officeAddress'], ['timezone', 'timezone'], ['whatsapp', 'whatsapp'],
              ['facebook', 'facebook'], ['map_url', 'mapUrl'],
            ].map(([key, label]) => <div key={key}><label className="block text-sm font-semibold mb-1" htmlFor={`setting-${key}`}>{t(`workspace.${label}`)}</label>
              <input id={`setting-${key}`} className="field" value={settings[key] ?? ''} onChange={(event) => setSettings((value) => ({ ...value, [key]: event.target.value }))} /></div>)}
            <button className="btn btn-navy" type="submit" disabled={busy}>{t('workspace.saveSettings')}</button>
          </form>
          <form onSubmit={addAvailability} className="bg-white rounded-xl border border-navy/10 p-5 space-y-4">
            <h2 className="font-bold text-navy">{t('workspace.availability')}</h2>
            <div className="grid sm:grid-cols-4 gap-3">
              <label className="text-sm">{t('workspace.weekday')}<select name="weekday" className="field mt-1">{t('workspace.weekdays').map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
              <label className="text-sm">{t('workspace.startTime')}<input name="start_time" className="field mt-1" type="time" required /></label>
              <label className="text-sm">{t('workspace.endTime')}<input name="end_time" className="field mt-1" type="time" required /></label>
              <label className="text-sm">{t('workspace.duration')}<input name="slot_minutes" className="field mt-1" type="number" min="15" max="480" step="15" defaultValue="60" required /></label>
              <label className="text-sm">{t('workspace.breakStart')}<input name="break_start" className="field mt-1" type="time" /></label>
              <label className="text-sm">{t('workspace.breakEnd')}<input name="break_end" className="field mt-1" type="time" /></label>
            </div>
            <button className="btn btn-navy" type="submit">{t('workspace.addAvailability')}</button>
            <div className="space-y-2">{availability.map((slot) => <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper p-3 text-sm">
              <span>{t('workspace.weekdays')[slot.weekday]} — {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} ({slot.slot_minutes} min)</span>
              <button type="button" className="btn btn-ghost !py-1 !px-3 text-xs" onClick={() => updateRecord('office_availability', slot.id, { is_active: !slot.is_active })}>{slot.is_active ? t('workspace.enabled') : t('adminArea.inactive')}</button>
            </div>)}</div>
          </form>
          <div className="bg-white rounded-xl border border-navy/10 p-5 space-y-4">
            <h2 className="font-bold text-navy">{t('workspace.manageServices')}</h2>
            {services.map((service) => <article key={service.code} className="rounded-lg border border-navy/10 p-4 space-y-3">
              <h3 className="font-bold text-navy">{service.code}</h3>
              {[
                ['title_ar', 'titleArabic'], ['title_en', 'titleEnglish'],
                ['short_ar', 'shortArabic'], ['short_en', 'shortEnglish'],
                ['details_ar', 'detailsArabic'], ['details_en', 'detailsEnglish'],
              ].map(([field, label]) => {
                const multiline = field.startsWith('details')
                const Field = multiline ? 'textarea' : 'input'
                return <label key={field} className="block text-sm font-semibold">{t(`workspace.${label}`)}
                  <Field className="field mt-1" rows={multiline ? 3 : undefined} value={service[field] || ''}
                    onChange={(event) => setServices((values) => values.map((item) => item.code === service.code ? { ...item, [field]: event.target.value } : item))} />
                </label>
              })}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-navy" type="button" onClick={() => saveService(service)}>{t('common.save')}</button>
                <button className="btn btn-ghost" type="button" onClick={() => saveService({ ...service, is_active: !service.is_active })}>
                  {service.is_active ? t('workspace.deactivateService') : t('workspace.activateService')}
                </button>
              </div>
            </article>)}
          </div>
        </div>
      )}

      {kind === 'notifications' && (
        <div className="space-y-3">{items.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${item.read_at ? 'bg-white border-navy/10' : 'bg-white border-gold/60'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-bold text-navy">{lang === 'ar' ? item.title_ar || item.title : item.title_en || item.title}</h2><p className="mt-1 text-sm text-ink/70">{lang === 'ar' ? item.body_ar || item.body : item.body_en || item.body}</p>
              <time className="mt-2 block text-xs text-ink/50" dir="ltr">{new Date(item.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</time></div>
            {!item.read_at && <button className="btn btn-ghost !py-1.5 !px-3 text-xs" type="button" onClick={() => markNotificationRead(item.id)}>{t('workspace.markRead')}</button>}
          </div>
        </article>)}</div>
      )}

      {kind === 'activity' && (
        <div className="space-y-3">
          {loading && <p className="py-8 text-center text-ink/60">{t('common.loading')}</p>}
          {!loading && !items.length && <p className="rounded-xl bg-white p-8 text-center text-ink/60">{t('workspace.noItems')}</p>}
          {items.map((item) => <article key={item.id} className="bg-white rounded-xl border border-navy/10 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <strong className="text-navy">{item.action}</strong>
              <time className="text-xs text-ink/50" dir="ltr">{new Date(item.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</time>
            </div>
            <p className="mt-2 text-xs text-ink/60 break-all" dir="ltr">
              {item.actor_id || t('workspace.systemAction')} · {item.target_user_id || ''} · {JSON.stringify(item.details)}
            </p>
          </article>)}
        </div>
      )}

      {['documents', 'appointments', 'requests'].includes(kind) && (
        <div className="space-y-3">
          {kind === 'appointments' && isAdmin && <div className="bg-white rounded-xl border border-navy/10 p-4 flex flex-wrap items-center gap-2">
            <input type="date" className="field max-w-52" aria-label={t('workspace.dateTime')} value={calendarDate || dateInTimezone(new Date(), settings.timezone || 'UTC')} onChange={(event) => setCalendarDate(event.target.value)} />
            {['day', 'week', 'month'].map((mode) => <button key={mode} type="button" className={`btn !py-2 ${calendarMode === mode ? 'btn-navy' : 'btn-ghost'}`} onClick={() => setCalendarMode(mode)}>{t(`workspace.${mode}`)}</button>)}
          </div>}
          {loading && <p className="py-8 text-center text-ink/60">{t('common.loading')}</p>}
          {!loading && !displayItems.length && <p className="rounded-xl bg-white p-8 text-center text-ink/60">{t('workspace.noItems')}</p>}
          {displayItems.map((row) => (
            <article key={row.id} className="bg-white rounded-xl border border-navy/10 p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-navy break-words">
                    {kind === 'documents' ? row.title : kind === 'appointments' ? serviceName(row.service_code) : serviceName(row.service_code)}
                  </h2>
                  {isAdmin && <p className="text-xs text-ink/60 mt-1" dir="ltr">{clients.find((client) => client.id === row.client_id)?.email || row.client_id}</p>}
                  <p className="text-sm text-ink/70 mt-1">
                    {kind === 'documents' ? row.file_name : kind === 'appointments'
                      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { timeZone: settings.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.starts_at))
                      : row.description}
                  </p>
                  {kind === 'requests' && row.business_activity && <p className="text-xs text-ink/60 mt-1">{row.business_activity}</p>}
                  {kind === 'appointments' && row.client_note && <p className="text-xs text-ink/60 mt-1">{row.client_note}</p>}
                  {kind === 'documents' && row.staff_note && <p className="text-xs text-ink/60 mt-1">{t('workspace.staffNote')}: {row.staff_note}</p>}
                </div>
                <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-navy">{statusName(row.status)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink/50">
                <span>{new Date(row.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</span>
                {kind === 'documents' && <button type="button" className="btn btn-ghost !py-1.5 !px-3 text-xs" onClick={() => downloadFile('client-documents', row.storage_path)}><Download size={15} />{t('workspace.download')}</button>}
              </div>
              {!isAdmin && kind === 'appointments' && ['pending', 'confirmed', 'reschedule_requested', 'rescheduled'].includes(row.status) &&
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost !py-1.5 !px-3 text-xs" type="button" onClick={() => updateRecord('appointments', row.id, { status: 'reschedule_requested' })}>{t('workspace.requestReschedule')}</button>
                  <button className="btn btn-ghost !py-1.5 !px-3 text-xs text-red-700" type="button" onClick={() => {
                    if (window.confirm(t('workspace.confirmCancel'))) updateRecord('appointments', row.id, { status: 'cancelled' })
                  }}>{t('workspace.cancelAppointment')}</button>
                </div>}
              {isAdmin && kind === 'documents' && <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
                <select className="field" aria-label={t('workspace.status')} value={row.status} onChange={(event) => updateRecord('documents', row.id, { status: event.target.value, handled_by: user.id })}>
                  {STATUS_OPTIONS.documents.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}
                </select>
                {isAdminLevel && <select className="field" aria-label={t('workspace.staffNote')} value={row.handled_by || ''} onChange={(event) => updateRecord('documents', row.id, { handled_by: event.target.value || null })}>
                  <option value="">{t('workspace.unassigned')}</option>{clients.filter((person) => ['staff', 'office_admin', 'super_admin'].includes(person.role)).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                </select>}
                <input className="field" aria-label={t('workspace.staffNote')} placeholder={t('workspace.staffNote')} defaultValue={row.staff_note} id={`doc-note-${row.id}`} />
                <button className="btn btn-navy" type="button" onClick={() => updateRecord('documents', row.id, { staff_note: document.getElementById(`doc-note-${row.id}`).value, handled_by: user.id })}>{t('common.save')}</button>
              </div>}
              {isAdmin && kind === 'appointments' && <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                <select className="field" aria-label={t('workspace.status')} value={row.status} onChange={(event) => updateRecord('appointments', row.id, { status: event.target.value, assigned_to: row.assigned_to || user.id })}>
                  {STATUS_OPTIONS.appointments.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}
                </select>
                <select className="field" aria-label={t('workspace.assignedStaff')} value={row.assigned_to || ''} onChange={(event) => updateRecord('appointments', row.id, { assigned_to: event.target.value || null })}>
                  <option value="">{t('workspace.unassigned')}</option>{clients.filter((client) => ['staff', 'office_admin', 'super_admin'].includes(client.role)).map((client) => <option key={client.id} value={client.id}>{client.full_name}</option>)}
                </select>
                <input className="field sm:col-span-2" aria-label={t('workspace.schedule')} type="datetime-local" value={rescheduleTimes[row.id] ?? officeIsoToWallTime(row.starts_at, settings.timezone || 'UTC')}
                  onChange={(event) => setRescheduleTimes((values) => ({ ...values, [row.id]: event.target.value }))} />
                <button className="btn btn-ghost" type="button" onClick={() => rescheduleAppointment(row)}>{t('workspace.schedule')}</button>
                <input className="field sm:col-span-2" aria-label={t('workspace.staffNote')} placeholder={t('workspace.staffNote')} defaultValue={row.internal_note} id={`appointment-note-${row.id}`} />
                <button className="btn btn-navy" type="button" onClick={() => updateRecord('appointments', row.id, { internal_note: document.getElementById(`appointment-note-${row.id}`).value })}>{t('common.save')}</button>
              </div>}
              {isAdmin && kind === 'requests' && <div className="grid sm:grid-cols-[1fr_1fr] gap-2">
                <select className="field" aria-label={t('workspace.status')} value={row.status} onChange={(event) => updateRecord('service_requests', row.id, { status: event.target.value })}>
                  {STATUS_OPTIONS.requests.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}
                </select>
                {isAdminLevel && <select className="field" aria-label={t('workspace.assignedStaff')} value={row.assigned_to || ''} onChange={(event) => updateRecord('service_requests', row.id, { assigned_to: event.target.value || null })}>
                  <option value="">{t('workspace.unassigned')}</option>{clients.filter((client) => ['staff', 'office_admin', 'super_admin'].includes(client.role)).map((client) => <option key={client.id} value={client.id}>{client.full_name}</option>)}
                </select>}
                <input className="field sm:col-span-2" aria-label={t('workspace.staffNote')} placeholder={t('workspace.staffNote')} defaultValue={row.internal_note} id={`request-note-${row.id}`} />
                <button className="btn btn-navy" type="button" onClick={() => updateRecord('service_requests', row.id, { internal_note: document.getElementById(`request-note-${row.id}`).value })}>{t('common.save')}</button>
              </div>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
