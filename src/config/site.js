// Contact details and service text are loaded from Supabase Office Settings.
// This file contains local-only fallback content and presentation metadata.
export const site = {
  phones: [],
  email: '',
  whatsapp: '',                          // e.g. '201000000000' (digits only, with country code)
  facebook: '',                          // full Facebook page URL
  mapEmbedUrl: '',                       // Google Maps "Embed a map" src URL
  stats: [],                             // e.g. [{ value: '120+', ar: 'عميل', en: 'Clients' }] - hidden while empty
}
export const services = [
  { id: 'accounting', icon: 'Calculator' },
  { id: 'tax-returns', icon: 'FileText' },
  { id: 'vat', icon: 'Percent' },
  { id: 'company-formation', icon: 'Building2' },
  { id: 'contracts', icon: 'FileSignature' },
  { id: 'committees', icon: 'Users' },
  { id: 'tax-appeal', icon: 'Scale' },
  { id: 'other', icon: 'Briefcase' },
]
