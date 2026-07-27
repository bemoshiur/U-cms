import type { Payload } from 'payload'

import type { SeedStep } from '../../types'
import { daysAgoISO, lexical, pdfBuffer, pngBuffer, siteIdBySiteId } from './shared'

/**
 * The heart of the RICH DEMO SEED (owner mandate: boards must not look empty).
 * Ensures ONE board of every legacy kind on the demo site — Notice (integrated),
 * Press Releases (extended), Q&A, FAQ, Gallery (photo), and the Attachment /
 * data-library board — and fills each with 12-15 realistic English
 * government-portal posts: pinned + regular notices, answered + open Q&A,
 * FAQ accordion entries, gallery posts with representative images, and
 * data-library posts with downloadable files. Dates are spread over ~7 months
 * and view counts vary so lists render like a real running site.
 *
 * Idempotent: boards by (tenant, name); posts by (board, title); attachment
 * uploads only happen on the create path (a re-run skips the whole post).
 */

/** Monotonic counter so seeded upload filenames never collide across a run. */
let uploadSeq = 0

function nextUploadName(prefix: string, ext: string): string {
  uploadSeq += 1
  return `${prefix}-${Date.now()}-${uploadSeq}.${ext}`
}

async function boardTypeIdByCode(payload: Payload, code: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`[seed:rich-boards] board type "${code}" not found — did boardTypesStep run?`)
  }
  return id
}

/** Finds a board by (tenant, name), or creates it; returns its id. Idempotent. */
async function ensureBoard(
  payload: Payload,
  tenantId: number,
  name: string,
  data: Record<string, unknown>,
): Promise<number> {
  const existing = await payload.find({
    collection: 'boards',
    where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    return existing.docs[0].id
  }
  const created = await payload.create({
    collection: 'boards',
    data: { tenant: tenantId, name, ...data } as never,
    overrideAccess: true,
  })
  payload.logger.info(`[seed:rich-boards] created board "${name}".`)
  return created.id
}

type PostSeed = {
  title: string
  author: string
  body: string[]
  isNotice?: boolean
  viewCount?: number
  dayOffset: number
  answer?: string[]
  /** When set, uploads a representative image (photo) or a data file (attachment). */
  attachment?: 'image' | 'pdf'
}

/** Creates a tenant-scoped attachment upload; returns its id. */
async function createAttachment(
  payload: Payload,
  tenantId: number,
  kind: 'image' | 'pdf',
  alt: string,
): Promise<number> {
  const isImage = kind === 'image'
  const data = isImage ? pngBuffer() : pdfBuffer()
  const created = await payload.create({
    collection: 'attachments',
    data: { alt, tenant: tenantId } as never,
    file: {
      data,
      name: nextUploadName(isImage ? 'seed-gallery' : 'seed-doc', isImage ? 'png' : 'pdf'),
      mimetype: isImage ? 'image/png' : 'application/pdf',
      size: data.length,
    },
    overrideAccess: true,
  })
  return created.id
}

async function ensurePost(
  payload: Payload,
  boardId: number,
  tenantId: number,
  seed: PostSeed,
): Promise<void> {
  const existing = await payload.find({
    collection: 'posts',
    where: { and: [{ board: { equals: boardId } }, { title: { equals: seed.title } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    return
  }

  const attachments: Record<string, unknown>[] = []
  if (seed.attachment) {
    const mediaId = await createAttachment(
      payload,
      tenantId,
      seed.attachment,
      `${seed.title} — attachment`,
    )
    attachments.push({
      media: mediaId,
      description: seed.attachment === 'image' ? 'Representative image' : seed.title,
      ...(seed.attachment === 'image' ? { isRepresentative: true } : {}),
    })
  }

  await payload.create({
    collection: 'posts',
    data: {
      board: boardId,
      title: seed.title,
      author: seed.author,
      content: lexical(...seed.body),
      createdAt: daysAgoISO(seed.dayOffset),
      ...(seed.isNotice ? { isNotice: true, noticeFrom: daysAgoISO(seed.dayOffset) } : {}),
      ...(typeof seed.viewCount === 'number' ? { viewCount: seed.viewCount } : {}),
      ...(seed.answer
        ? {
            answer: lexical(...seed.answer),
            answeredAt: daysAgoISO(seed.dayOffset - 1 > 0 ? seed.dayOffset - 1 : 0),
          }
        : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    } as never,
    overrideAccess: true,
  })
}

/** Builds a standard 2-paragraph body from a lead line + a shared closing line. */
function body(lead: string, closing: string): string[] {
  return [lead, closing]
}

const NOTICE_CLOSE =
  'For further details, please contact the responsible department or use the online enquiry service.'

const NOTICE_POSTS: PostSeed[] = [
  {
    title: 'Personal Information Processing Policy — 2026 revision',
    author: 'Administrator',
    isNotice: true,
    viewCount: 842,
    dayOffset: 12,
    body: body(
      'Our Personal Information Processing Policy has been revised effective 1 January 2026 to reflect updated retention periods and third-party processing disclosures.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Scheduled maintenance: online services unavailable Sat 02:00–06:00',
    author: 'Systems Operations Team',
    isNotice: true,
    viewCount: 511,
    dayOffset: 6,
    body: body(
      'Online services will be temporarily unavailable during a scheduled infrastructure upgrade this Saturday from 02:00 to 06:00.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'New integrated public service portal now live',
    author: 'Digital Communications Team',
    isNotice: true,
    viewCount: 1290,
    dayOffset: 3,
    body: body(
      'The new integrated public service portal is now live, bringing civil applications, notices, and payments together in one place.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Office relocation: Civil Affairs counter moves to 2F',
    author: 'General Affairs Team',
    viewCount: 274,
    dayOffset: 20,
    body: body(
      'The Civil Affairs counter has relocated to the second floor to improve accessibility and reduce wait times.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: '2026 public holiday service hours',
    author: 'Administrator',
    viewCount: 389,
    dayOffset: 34,
    body: body(
      'Please review the adjusted counter and online service hours for the 2026 public holidays.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Call for public comment: draft urban mobility plan',
    author: 'Policy Planning Team',
    viewCount: 203,
    dayOffset: 47,
    body: body(
      'We invite residents to submit comments on the draft urban mobility plan through the online consultation form.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Recruitment notice: fixed-term administrative positions',
    author: 'Human Resources Team',
    viewCount: 655,
    dayOffset: 58,
    body: body(
      'Applications are open for several fixed-term administrative positions. See the attached guidance for eligibility and deadlines.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Winter road-safety advisory',
    author: 'Administrator',
    viewCount: 142,
    dayOffset: 72,
    body: body(
      'With freezing conditions expected, please observe reduced speed limits and use designated pedestrian routes.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Annual customer satisfaction survey now open',
    author: 'Data & Statistics Team',
    viewCount: 318,
    dayOffset: 88,
    body: body(
      'Help us improve public services by completing this year’s short customer satisfaction survey.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Update to online payment methods',
    author: 'Systems Operations Team',
    viewCount: 261,
    dayOffset: 104,
    body: body(
      'Additional online payment methods, including mobile wallets, are now supported for local taxes and fees.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Data center power upgrade — brief service interruptions',
    author: 'Systems Operations Team',
    viewCount: 176,
    dayOffset: 121,
    body: body(
      'A planned data-center power upgrade may cause brief, intermittent service interruptions next week.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'New accessibility features on the public website',
    author: 'Digital Communications Team',
    viewCount: 233,
    dayOffset: 139,
    body: body(
      'The public website now offers improved keyboard navigation, high-contrast mode, and screen-reader support.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Notice of temporary closure during national holiday',
    author: 'Administrator',
    viewCount: 198,
    dayOffset: 158,
    body: body(
      'All counters will be closed during the national holiday; online services remain available.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Public hearing schedule for the FY2026 budget',
    author: 'Budget & Finance Team',
    viewCount: 221,
    dayOffset: 176,
    body: body(
      'The schedule of public hearings on the FY2026 budget proposal is now available.',
      NOTICE_CLOSE,
    ),
  },
  {
    title: 'Guidelines for submitting civil complaints online',
    author: 'Administrator',
    viewCount: 402,
    dayOffset: 197,
    body: body(
      'Step-by-step guidance is now available for submitting and tracking civil complaints online.',
      NOTICE_CLOSE,
    ),
  },
]

const PRESS_CLOSE =
  'The city remains committed to transparent, resident-centered public administration.'

const PRESS_POSTS: PostSeed[] = [
  {
    title: 'City completes smart-traffic signal upgrade across 30 intersections',
    author: 'Media Relations Team',
    viewCount: 934,
    dayOffset: 8,
    body: body(
      'The city has completed a smart-traffic signal upgrade across 30 key intersections, cutting average peak-hour delays.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Mayor announces expanded childcare support for 2026',
    author: 'Media Relations Team',
    viewCount: 1122,
    dayOffset: 15,
    body: body(
      'The Mayor announced an expansion of childcare support for 2026, increasing subsidized places and extending hours.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Quarterly performance report shows 12% faster complaint resolution',
    author: 'Media Relations Team',
    viewCount: 421,
    dayOffset: 26,
    body: body(
      'The latest quarterly performance report shows a 12% improvement in the average time to resolve civil complaints.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'New public library branch opens in the eastern district',
    author: 'Media Relations Team',
    viewCount: 588,
    dayOffset: 39,
    body: body(
      'A new public library branch has opened in the eastern district, adding study spaces and a children’s reading room.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Green-energy initiative cuts municipal emissions by 8%',
    author: 'Media Relations Team',
    viewCount: 377,
    dayOffset: 52,
    body: body(
      'A municipal green-energy initiative has reduced building emissions by 8% year on year.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Digital services win national e-government award',
    author: 'Media Relations Team',
    viewCount: 803,
    dayOffset: 66,
    body: body(
      'The city’s digital public services have received a national e-government award for accessibility and usability.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Flood-prevention infrastructure project reaches milestone',
    author: 'Media Relations Team',
    viewCount: 245,
    dayOffset: 81,
    body: body(
      'A major flood-prevention infrastructure project has reached a key construction milestone ahead of the rainy season.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Small-business support fund disburses first grants',
    author: 'Media Relations Team',
    viewCount: 519,
    dayOffset: 95,
    body: body(
      'The small-business support fund has disbursed its first round of grants to local enterprises.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Public transit ridership returns to pre-pandemic levels',
    author: 'Media Relations Team',
    viewCount: 462,
    dayOffset: 110,
    body: body(
      'Public transit ridership has returned to pre-pandemic levels following service and frequency improvements.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Citywide free public Wi-Fi expansion completed',
    author: 'Media Relations Team',
    viewCount: 671,
    dayOffset: 126,
    body: body(
      'The citywide free public Wi-Fi expansion is complete, adding coverage to parks, markets, and transit hubs.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Youth employment program places 500 participants',
    author: 'Media Relations Team',
    viewCount: 356,
    dayOffset: 144,
    body: body(
      'The youth employment program has placed 500 participants in internships and full-time roles this year.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Heritage district restoration project unveiled',
    author: 'Media Relations Team',
    viewCount: 289,
    dayOffset: 161,
    body: body(
      'A restoration project for the historic heritage district has been unveiled, preserving landmark buildings.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Emergency response drill conducted across all districts',
    author: 'Media Relations Team',
    viewCount: 214,
    dayOffset: 179,
    body: body(
      'A coordinated emergency response drill was conducted across all districts to test preparedness.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Open-data platform surpasses one million downloads',
    author: 'Media Relations Team',
    viewCount: 498,
    dayOffset: 193,
    body: body(
      'The city’s open-data platform has surpassed one million dataset downloads since launch.',
      PRESS_CLOSE,
    ),
  },
  {
    title: 'Winter welfare support program begins',
    author: 'Media Relations Team',
    viewCount: 187,
    dayOffset: 205,
    body: body(
      'The seasonal winter welfare support program has begun, providing heating assistance to eligible households.',
      PRESS_CLOSE,
    ),
  },
]

const QNA_POSTS: PostSeed[] = [
  {
    title: 'How do I request a copy of my resident registration?',
    author: 'James Wilson',
    viewCount: 132,
    dayOffset: 5,
    body: body('I need a certified copy of my resident registration. What is the process?', ''),
    answer: [
      'You can request it online through the civil documents service, or in person at the Civil Affairs counter with valid photo ID.',
    ],
  },
  {
    title: 'What are the office hours for the Civil Affairs counter?',
    author: 'Sophia Kim',
    viewCount: 98,
    dayOffset: 11,
    body: body('Could you tell me the counter hours, including any lunch closure?', ''),
    answer: [
      'The Civil Affairs counter is open 09:00–18:00 on weekdays, with a lunch break from 12:00 to 13:00.',
    ],
  },
  {
    title: 'Can I pay local taxes online?',
    author: 'Michael Turner',
    viewCount: 156,
    dayOffset: 18,
    body: body('Is there a way to pay my local taxes without visiting in person?', ''),
    answer: [
      'Yes. Local taxes can be paid online via card, bank transfer, or mobile wallet in the online payments service.',
    ],
  },
  {
    title: 'How do I apply for a parking permit?',
    author: 'Olivia Hughes',
    viewCount: 77,
    dayOffset: 27,
    body: body('What documents do I need to apply for a residential parking permit?', ''),
    answer: [
      'Apply online with proof of residence and vehicle registration; permits are usually issued within three business days.',
    ],
  },
  {
    title: 'Where can I find the FY2026 budget documents?',
    author: 'Benjamin Lee',
    viewCount: 64,
    dayOffset: 36,
    body: body('I am looking for the published budget documents for this year.', ''),
    answer: [
      'The FY2026 budget documents are available in the data-library board under “FY2026 budget summary”.',
    ],
  },
  {
    title: 'How do I report a broken streetlight?',
    author: 'Emma Novak',
    viewCount: 89,
    dayOffset: 44,
    body: body('There is a broken streetlight on my road. How do I report it?', ''),
    answer: [
      'Please submit an online civil complaint with the location; repairs are typically scheduled within a week.',
    ],
  },
  {
    title: 'Is there support available for small businesses?',
    author: 'Lucas Meyer',
    viewCount: 143,
    dayOffset: 55,
    body: body('What kind of support is available for a newly registered small business?', ''),
    answer: [
      'The small-business support fund offers grants and advisory services. See the notice board for the current application window.',
    ],
  },
  {
    title: 'How do I subscribe to public notices by email?',
    author: 'Grace Han',
    viewCount: 71,
    dayOffset: 63,
    body: body('I would like to receive new notices by email. Is that possible?', ''),
    answer: [
      'Sign in as a member and enable notice notifications in your profile settings to receive email updates.',
    ],
  },
  {
    title: 'What documents are needed for a business registration?',
    author: 'Henry Foster',
    viewCount: 118,
    dayOffset: 74,
    body: body('Which documents must I prepare for a business registration application?', ''),
    answer: [
      'You will need a completed application form, identification, and proof of the business address. Additional documents may apply by business type.',
    ],
  },
  {
    title: 'How long does a civil complaint usually take?',
    author: 'Chloe Martin',
    viewCount: 52,
    dayOffset: 86,
    body: body('On average, how long until a civil complaint receives a response?', ''),
  },
  {
    title: 'Can I reserve a public sports facility online?',
    author: 'Nathan Reed',
    viewCount: 60,
    dayOffset: 99,
    body: body('Is online reservation available for public sports facilities?', ''),
  },
  {
    title: 'How do I update my address on file?',
    author: 'Ava Sinclair',
    viewCount: 47,
    dayOffset: 112,
    body: body('I have moved and need to update my registered address.', ''),
  },
  {
    title: 'Are there volunteer opportunities with the city?',
    author: 'Ethan Brooks',
    viewCount: 55,
    dayOffset: 128,
    body: body('Where can I find information about volunteering?', ''),
  },
  {
    title: 'How do I request accessible-format documents?',
    author: 'Mia Larsson',
    viewCount: 39,
    dayOffset: 147,
    body: body('I need documents in an accessible format. How do I request this?', ''),
  },
  {
    title: 'Where can I find information about recycling collection?',
    author: 'Owen Clarke',
    viewCount: 66,
    dayOffset: 168,
    body: body('What is the recycling collection schedule for my area?', ''),
  },
]

const FAQ_POSTS: PostSeed[] = [
  {
    title: 'How do I reset my member password?',
    author: 'Digital Communications Team',
    viewCount: 421,
    dayOffset: 9,
    body: body(
      'Use the “Find password” link on the login page. A reset link will be sent to your registered email address.',
      '',
    ),
  },
  {
    title: 'What browsers are supported by the website?',
    author: 'Digital Communications Team',
    viewCount: 210,
    dayOffset: 17,
    body: body(
      'The website supports the latest versions of Chrome, Edge, Safari, and Firefox on desktop and mobile.',
      '',
    ),
  },
  {
    title: 'How do I unsubscribe from email notifications?',
    author: 'Digital Communications Team',
    viewCount: 176,
    dayOffset: 25,
    body: body(
      'Sign in and turn off notification options in your member profile, or use the unsubscribe link in any notification email.',
      '',
    ),
  },
  {
    title: 'Can I use the services on a mobile device?',
    author: 'Digital Communications Team',
    viewCount: 305,
    dayOffset: 33,
    body: body(
      'Yes. The public website and services are fully responsive and work on smartphones and tablets.',
      '',
    ),
  },
  {
    title: 'How is my personal information protected?',
    author: 'Administrative Services Division',
    viewCount: 264,
    dayOffset: 42,
    body: body(
      'Personal information is processed under our published policy, with access logging, masking, and strict retention limits.',
      '',
    ),
  },
  {
    title: 'What should I do if a page does not load?',
    author: 'Systems Operations Team',
    viewCount: 138,
    dayOffset: 51,
    body: body(
      'Refresh the page, clear your browser cache, and try again. If the problem persists, contact technical support.',
      '',
    ),
  },
  {
    title: 'How do I attach files to an online complaint?',
    author: 'Digital Communications Team',
    viewCount: 121,
    dayOffset: 61,
    body: body(
      'On the complaint form, use the attachment field. Supported formats include PDF, JPG, PNG, and HWP up to the stated size limit.',
      '',
    ),
  },
  {
    title: 'Are the online services free to use?',
    author: 'Digital Communications Team',
    viewCount: 189,
    dayOffset: 70,
    body: body(
      'Using the online services is free. Certain civil documents may carry a statutory issuance fee.',
      '',
    ),
  },
  {
    title: 'How do I change my contact information?',
    author: 'Digital Communications Team',
    viewCount: 97,
    dayOffset: 82,
    body: body(
      'Sign in and update your contact details in your member profile. Changes take effect immediately.',
      '',
    ),
  },
  {
    title: 'Who do I contact for technical support?',
    author: 'Systems Operations Team',
    viewCount: 156,
    dayOffset: 93,
    body: body(
      'Use the online enquiry service or call the support line listed in the site footer during office hours.',
      '',
    ),
  },
  {
    title: 'How do I find a specific department’s phone number?',
    author: 'Digital Communications Team',
    viewCount: 84,
    dayOffset: 106,
    body: body(
      'Department contact numbers are listed in the organization directory on the public website.',
      '',
    ),
  },
  {
    title: 'Can I access services outside office hours?',
    author: 'Digital Communications Team',
    viewCount: 112,
    dayOffset: 120,
    body: body(
      'Online services are available 24/7, except during scheduled maintenance windows announced on the notice board.',
      '',
    ),
  },
  {
    title: 'How do I verify my identity online?',
    author: 'Systems Operations Team',
    viewCount: 143,
    dayOffset: 137,
    body: body(
      'Identity verification is available through the supported authentication methods during the application process.',
      '',
    ),
  },
  {
    title: 'What file formats can I upload?',
    author: 'Digital Communications Team',
    viewCount: 76,
    dayOffset: 155,
    body: body(
      'Common formats such as PDF, JPG, PNG, GIF, and HWP are supported. Individual services may restrict types and sizes.',
      '',
    ),
  },
  {
    title: 'How do I request a public-information disclosure?',
    author: 'Administrative Services Division',
    viewCount: 131,
    dayOffset: 174,
    body: body(
      'Submit a public-information disclosure request through the online form; you will receive a response within the statutory period.',
      '',
    ),
  },
]

const GALLERY_TITLES = [
  '2026 New Year policy briefing',
  'Community volunteer day',
  'Public library opening ceremony',
  'Smart-city technology exhibition',
  'Traditional culture festival',
  'Urban greening campaign',
  'Youth job fair',
  'Disaster-response training exercise',
  'Senior citizens’ welfare event',
  'Children’s science day',
  'City marathon',
  'Environmental clean-up drive',
]

const ATTACHMENT_TITLES = [
  'FY2026 budget summary',
  'Annual administrative report 2025',
  'Personal information processing policy (full text)',
  'Public service charter',
  'Urban mobility master plan (draft)',
  'Open-data usage guidelines',
  'Procurement guidelines 2026',
  'Citizen participation handbook',
  'Emergency preparedness guide',
  'Statistical yearbook 2025',
  'Accessibility compliance report',
  'Environmental impact assessment summary',
]

export const richBoardsAndPostsStep: SeedStep = {
  name: 'rich-boards-and-posts',
  async run(payload: Payload) {
    const tenantId = await siteIdBySiteId(payload, 'demo')

    // Boards of every kind (existing ones are found; new ones created).
    const noticeBoardId = await ensureBoard(payload, tenantId, 'Notice', {
      boardType: await boardTypeIdByCode(payload, 'PG0001'),
      isIntegrated: true,
      boardForm: 'list',
      attachmentsEnabled: true,
      headerNotice: 'Official notices and announcements.',
    })
    const pressBoardId = await ensureBoard(payload, tenantId, 'Press Releases', {
      boardType: await boardTypeIdByCode(payload, 'PG0010'),
      boardForm: 'list',
      attachmentsEnabled: true,
      attachmentMaxCount: 3,
      headerNotice: 'Official press releases and news.',
    })
    const qnaBoardId = await ensureBoard(payload, tenantId, 'Q&A', {
      boardType: await boardTypeIdByCode(payload, 'PG0003'),
      boardForm: 'list',
      attachmentsEnabled: false,
    })
    const faqBoardId = await ensureBoard(payload, tenantId, 'FAQ', {
      boardType: await boardTypeIdByCode(payload, 'PG0004'),
      boardForm: 'list',
      attachmentsEnabled: false,
      headerNotice: 'Frequently asked questions.',
    })
    const galleryBoardId = await ensureBoard(payload, tenantId, 'Gallery', {
      boardType: await boardTypeIdByCode(payload, 'PG0002'),
      boardForm: 'thumbnail',
      attachmentsEnabled: true,
      attachmentMaxCount: 5,
    })
    const attachmentBoardId = await ensureBoard(payload, tenantId, 'Attachment Board', {
      boardType: await boardTypeIdByCode(payload, 'PG0006'),
      boardForm: 'list',
      attachmentsEnabled: true,
      attachmentMaxCount: 5,
      headerNotice: 'Downloadable documents and datasets.',
    })

    for (const p of NOTICE_POSTS) {
      await ensurePost(payload, noticeBoardId, tenantId, p)
    }
    for (const p of PRESS_POSTS) {
      await ensurePost(payload, pressBoardId, tenantId, p)
    }
    for (const p of QNA_POSTS) {
      await ensurePost(payload, qnaBoardId, tenantId, p)
    }
    for (const p of FAQ_POSTS) {
      await ensurePost(payload, faqBoardId, tenantId, p)
    }
    for (const [i, title] of GALLERY_TITLES.entries()) {
      await ensurePost(payload, galleryBoardId, tenantId, {
        title,
        author: 'Digital Communications Team',
        viewCount: 120 + i * 13,
        dayOffset: 7 + i * 16,
        attachment: 'image',
        body: body(
          `Photos from the ${title.toLowerCase()}, held with residents and staff across the city.`,
          'Additional photos are available on request from the Public Relations Division.',
        ),
      })
    }
    for (const [i, title] of ATTACHMENT_TITLES.entries()) {
      await ensurePost(payload, attachmentBoardId, tenantId, {
        title,
        author: 'Data & Statistics Team',
        viewCount: 60 + i * 9,
        dayOffset: 5 + i * 17,
        attachment: 'pdf',
        body: body(
          `The ${title} is available for download below.`,
          'Please cite the source when reusing this document.',
        ),
      })
    }

    payload.logger.info('[seed:rich-boards-and-posts] ensured boards + posts across all kinds.')
  },
}

/**
 * A couple more example documents in each of the four §3 security-document
 * libraries so they render fuller (owner mandate). Layered on top of
 * `securityDocsStep`, which created the four boards + two posts each.
 * Idempotent by (board, title); posts inherit `securityDoc: true` from the board.
 */
const SECURITY_DOC_EXTRAS: Record<string, { title: string; author: string; body: string }[]> = {
  'Security Education': [
    {
      title: 'Password and Credential Hygiene Guide',
      author: 'Privacy Officer',
      body: 'Best practices for strong passwords, credential rotation, and avoiding reuse across systems.',
    },
    {
      title: 'Secure Remote Working Checklist',
      author: 'Privacy Officer',
      body: 'A checklist for handling personal information safely when working outside the office.',
    },
  ],
  'Security Cases': [
    {
      title: 'Case Study: Misdirected Email Containing PII',
      author: 'Privacy Team',
      body: 'How a misdirected email was contained, notified, and prevented through DLP controls.',
    },
    {
      title: 'Case Study: Unauthorized Access Attempt',
      author: 'Privacy Team',
      body: 'Timeline and response for a detected unauthorized access attempt against an admin account.',
    },
  ],
  'Security Management Plan': [
    {
      title: 'Access Control and Least-Privilege Policy',
      author: 'Privacy Officer',
      body: 'Role-based access control principles and the least-privilege review cycle.',
    },
    {
      title: 'Encryption and Key Management Standard',
      author: 'Privacy Officer',
      body: 'Standards for encrypting personal information at rest and in transit, and key handling.',
    },
  ],
  'Incident Response Guidelines': [
    {
      title: 'Breach Severity Classification Matrix',
      author: 'Privacy Officer',
      body: 'How to classify the severity of a personal-information breach and the corresponding response.',
    },
    {
      title: 'Post-Incident Review Template',
      author: 'Privacy Officer',
      body: 'A template for conducting and documenting the post-incident review after a breach.',
    },
  ],
}

export const richSecurityDocsStep: SeedStep = {
  name: 'rich-security-docs',
  async run(payload: Payload) {
    const tenantId = await siteIdBySiteId(payload, 'demo')
    for (const [boardName, posts] of Object.entries(SECURITY_DOC_EXTRAS)) {
      const board = await payload.find({
        collection: 'boards',
        where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: boardName } }] },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const boardId = board.docs[0]?.id
      if (boardId === undefined) {
        payload.logger.info(`[seed:rich-security-docs] board "${boardName}" not found — skipping.`)
        continue
      }
      for (const [i, post] of posts.entries()) {
        const existing = await payload.find({
          collection: 'posts',
          where: { and: [{ board: { equals: boardId } }, { title: { equals: post.title } }] },
          limit: 1,
          pagination: false,
          overrideAccess: true,
        })
        if (existing.docs.length > 0) {
          continue
        }
        await payload.create({
          collection: 'posts',
          data: {
            board: boardId,
            title: post.title,
            author: post.author,
            content: lexical(post.body),
            createdAt: daysAgoISO(30 + i * 20),
          } as never,
          overrideAccess: true,
        })
      }
    }
    payload.logger.info('[seed:rich-security-docs] ensured extra security-document posts.')
  },
}
