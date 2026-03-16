// Comprehensive Email interface for both inbox and read views
export interface Email {
  id: number;
  from: string;
  to: string;
  subject: string;
  message: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  senderAvatar?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  size: string;
  type: string;
}

// Single comprehensive email data array
export const emailsData: Email[] = [
  {
    id: 1,
    from: 'Haley Kennedy',
    to: 'me',
    subject: 'Project Documentation',
    message: `Hello,

I've attached the complete project documentation for our latest collaboration. The files include:

1. Technical specifications
2. User interface mockups
3. Database schema
4. API documentation

Please review these documents and let me know if you have any questions or need clarification on any part.

Looking forward to your feedback.

Best regards,
Haley Kennedy`,
    date: '12 Jan',
    isUnread: true,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'tech-specs.pdf', size: '2.8 MB', type: 'pdf' },
      { name: 'ui-mockups.zip', size: '1.5 GB', type: 'zip' },
      { name: 'database-schema.sql', size: '45 KB', type: 'sql' },
      { name: 'api-docs.pdf', size: '3.2 MB', type: 'pdf' },
    ],
  },
  {
    id: 2,
    from: 'Cedric Kelly',
    to: 'me',
    subject: 'Urgent - Keys in Classroom',
    message: `Hi there,

I found your keys in the classroom after the lecture. They're currently in my possession and I'll keep them safe until you can pick them up.

Please come to my office (Room 205) as soon as possible to collect them. I'll be here until 5 PM today.

Best regards,
Cedric Kelly`,
    date: '08 Jan',
    isUnread: true,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 3,
    from: 'Bradley Greer',
    to: 'me',
    subject: 'Tootsie Roll Project',
    message: `Hello,

The world looks mighty good to me, cause Tootsie Rolls are all I see. Whatever it is I think I see, becomes a Tootsie Roll to me! Tootsie Roll how I love your chocolatey chew, Tootsie Roll I think I'm in love with you.

This project is going to be amazing and I can't wait to see the final results.

Best regards,
Bradley Greer`,
    date: '14 Jan',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'project-files.zip', size: '8.2 MB', type: 'zip' },
      { name: 'presentation.pptx', size: '2.1 MB', type: 'pptx' },
    ],
  },
  {
    id: 4,
    from: 'Brenden Wagner',
    to: 'me',
    subject: 'Highlander Project',
    message: `Greetings,

I am Duncan Macleod, born 400 years ago in the Highlands of Scotland. I am Immortal, and I am not alone. For centuries, we have waited for the time of the Gathering when the stroke of a sword and the fall of a head will release the power of the Quickening. In the end, there can be only one.

This project represents the culmination of centuries of preparation.

Regards,
Brenden Wagner`,
    date: '28 Jan',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'highlander-docs.pdf', size: '1.8 MB', type: 'pdf' },
      { name: 'sword-specs.zip', size: '3.4 MB', type: 'zip' },
    ],
  },
  {
    id: 5,
    from: 'Bruno Nash',
    to: 'me',
    subject: 'Twilight Zone Project',
    message: `Hello,

You unlock this door with the key of imagination. Beyond it is another dimension: a dimension of sound, a dimension of sight, a dimension of mind. You're moving into a land of both shadow and substance, of things and ideas; you've just crossed over into the Twilight Zone.

This project will take us to new dimensions of creativity and innovation.

Best regards,
Bruno Nash`,
    date: '05 Feb',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 6,
    from: 'Sonya Frost',
    to: 'me',
    subject: 'Justice League Project',
    message: `Hello,

Gathered together from the cosmic reaches of the universe, here in this great Hall of Justice, are the most powerful forces of good ever assembled: Superman! Batman and Robin! Wonder Woman! Aquaman! And The Wonder Twins: Zan and Jayna, with their space monkey, Gleek! Dedicated to prove justice and peace for all mankind!

This project will bring together the best minds in the industry.

Regards,
Sonya Frost`,
    date: '13 Feb',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 7,
    from: 'Cedric Kelly',
    to: 'me',
    subject: 'Dream Project',
    message: `Hello,

Sometimes the world looks perfect, nothing to rearrange. Sometimes you just, get a feeling like you need some kind of change. No matter what the odds are this time, nothing's going to stand in my way. This flame in my heart, and a long lost friend gives every dark street a light at the end. Standing tall, on the wings of my dream. Rise and fall, on the wings of my dream. The rain and thunder, the wind and haze. I'm bound for better days. It's my life and my dream, nothing's going to stop me now.

This project represents our shared dreams and aspirations.

Best regards,
Cedric Kelly`,
    date: '18 Feb',
    isUnread: true,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'dream-project.zip', size: '12.5 MB', type: 'zip' },
      { name: 'vision-document.pdf', size: '4.2 MB', type: 'pdf' },
    ],
  },
  {
    id: 8,
    from: 'Haley Kennedy',
    to: 'me',
    subject: 'Young Ones Project',
    message: `Hello,

Once in every lifetime, comes a love like this. Oh I need you, you need me, oh my darling can't you see. Young Ones. Darling we're the Young Ones. Young Ones. Shouldn't be afraid. To live, love, there's a song to be sung. Cause we may not be the Young Ones very long.

This project celebrates youth and innovation.

Best regards,
Haley Kennedy`,
    date: '22 Feb',
    isUnread: false,
    isStarred: true,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 9,
    from: 'Bradley Greer',
    to: 'me',
    subject: "Dexter's Laboratory Project",
    message: `Hello,

Enter at your peril, past the vaulted door. Impossible things will happen that the world's never seen before. In Dexter's laboratory lives the smartest boy you've ever seen, but Dee Dee blows his experiments to Smithereens! There's gloom and doom when things go boom in Dexter's lab!

This project will push the boundaries of what's possible.

Best regards,
Bradley Greer`,
    date: '01 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'lab-experiments.zip', size: '6.7 MB', type: 'zip' },
      { name: 'research-paper.pdf', size: '2.9 MB', type: 'pdf' },
    ],
  },
  {
    id: 10,
    from: 'Brenden Wagner',
    to: 'me',
    subject: 'Hot Dogs Project',
    message: `Hello,

Hot dogs, Armour hot dogs. What kind of kids eat Armour hot dogs? Fat kids, skinny kids, kids who climb on rocks. Tough kids, sissy kids, even kids with chicken pox love hot dogs, Armour hot dogs... The dogs kids love to bite!

This project will be fun and engaging for everyone.

Best regards,
Brenden Wagner`,
    date: '07 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'hotdog-menu.pdf', size: '1.2 MB', type: 'pdf' },
      { name: 'marketing-materials.zip', size: '5.8 MB', type: 'zip' },
    ],
  },
  {
    id: 11,
    from: 'Ava Smith',
    to: 'me',
    subject: 'Quarterly Report Review',
    message: `Hi,

I've attached the quarterly report for your review. Please check the financial summary and let me know if you have any questions.

Looking forward to your feedback.

Best,
Ava`,
    date: '10 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'quarterly-report.pdf', size: '1.1 MB', type: 'pdf' }],
  },
  {
    id: 12,
    from: 'Liam Johnson',
    to: 'me',
    subject: 'Team Building Event',
    message: `Hello Team,

We're organizing a team building event next Friday. Please RSVP by Wednesday so we can finalize the arrangements. There will be games, food, and lots of fun!

Let me know if you have any dietary restrictions.

Thanks,
Liam`,
    date: '12 Mar',
    isUnread: true,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 13,
    from: 'Olivia Brown',
    to: 'me',
    subject: 'Design Mockups',
    message: `Hi,

The latest design mockups are ready for your review. I've incorporated the feedback from our last meeting. Please see the attached files and let me know your thoughts.

Best regards,
Olivia`,
    date: '14 Mar',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'mockups.zip', size: '3.2 MB', type: 'zip' }],
  },
  {
    id: 14,
    from: 'Noah Lee',
    to: 'me',
    subject: 'Weekly Standup Notes',
    message: `Hello,

Here are the notes from this week's standup. We discussed project timelines, blockers, and next steps. Please review and let me know if anything is missing.

Thanks,
Noah`,
    date: '16 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 15,
    from: 'Emma Wilson',
    to: 'me',
    subject: 'Invoice for March',
    message: `Hi,

Please find attached the invoice for March. Let me know if you need any changes or additional details.

Thank you for your business.

Best,
Emma`,
    date: '18 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'invoice-march.pdf', size: '550 KB', type: 'pdf' }],
  },
  {
    id: 16,
    from: 'Mason Davis',
    to: 'me',
    subject: 'Conference Registration',
    message: `Hi,

Your registration for the upcoming conference has been confirmed. Please see the attached ticket and agenda. Let me know if you have any questions.

Best regards,
Mason`,
    date: '20 Mar',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [
      { name: 'ticket.pdf', size: '300 KB', type: 'pdf' },
      { name: 'agenda.pdf', size: '200 KB', type: 'pdf' },
    ],
  },
  {
    id: 17,
    from: 'Sophia Martinez',
    to: 'me',
    subject: 'Welcome to the Team!',
    message: `Hello,

We're excited to have you join the team! Please find attached the onboarding documents. Let us know if you have any questions or need assistance getting started.

Welcome aboard!

Sophia`,
    date: '22 Mar',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'onboarding.pdf', size: '1.5 MB', type: 'pdf' }],
  },
  {
    id: 18,
    from: 'James Anderson',
    to: 'me',
    subject: 'System Maintenance Notice',
    message: `Dear User,

We will be performing scheduled system maintenance this weekend. The system will be unavailable from 10 PM Saturday to 6 AM Sunday. Please plan your work accordingly.

Thank you for your understanding.

James`,
    date: '24 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 19,
    from: 'Mia Thomas',
    to: 'me',
    subject: 'Feedback Request',
    message: `Hi,

Could you please provide feedback on the attached document? Your insights are valuable and will help us improve our process.

Thanks in advance!

Mia`,
    date: '26 Mar',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'feedback.docx', size: '120 KB', type: 'docx' }],
  },
  {
    id: 20,
    from: 'Benjamin White',
    to: 'me',
    subject: 'Holiday Schedule Update',
    message: `Hello,

Please note the updated holiday schedule for the next quarter. Let me know if you have any questions or concerns.

Best,
Benjamin`,
    date: '28 Mar',
    isUnread: true,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 21,
    from: 'Lucas King',
    to: 'me',
    subject: 'New Feature Proposal',
    message: `Hi Team,

I have a proposal for a new feature that could improve our user experience. The idea is to implement a smart search bar that predicts user intent. I've attached a document with more details and some mockups.

Let me know your thoughts.

Best,
Lucas`,
    date: '30 Mar',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'feature-proposal.pdf', size: '900 KB', type: 'pdf' }],
  },
  {
    id: 22,
    from: 'Ella Scott',
    to: 'me',
    subject: 'Weekly Update',
    message: `Hello,

Here's the weekly update on our project. We completed the initial testing phase and fixed several bugs. The next step is to prepare for the client demo next week.

Please review the attached summary.

Thanks,
Ella`,
    date: '01 Apr',
    isUnread: true,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'weekly-summary.docx', size: '80 KB', type: 'docx' }],
  },
  {
    id: 23,
    from: 'Henry Turner',
    to: 'me',
    subject: 'Vacation Notice',
    message: `Hi,

I will be on vacation from April 10th to April 20th. During this period, please contact my backup for any urgent issues. I will respond to emails when I return.

Best regards,
Henry`,
    date: '03 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 24,
    from: 'Grace Evans',
    to: 'me',
    subject: 'Client Feedback',
    message: `Hello,

We received feedback from the client regarding the latest release. Most comments are positive, but there are a few suggestions for improvement. Please see the attached feedback document.

Let's discuss in our next meeting.

Grace`,
    date: '05 Apr',
    isUnread: true,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'client-feedback.pdf', size: '300 KB', type: 'pdf' }],
  },
  {
    id: 25,
    from: 'Jack Harris',
    to: 'me',
    subject: 'Security Update',
    message: `Dear User,

A new security update has been released. Please update your passwords and review the attached security guidelines. If you have any questions, contact IT support.

Stay safe,
Jack`,
    date: '07 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'security-guidelines.pdf', size: '400 KB', type: 'pdf' }],
  },
  {
    id: 26,
    from: 'Chloe Walker',
    to: 'me',
    subject: 'Design Review Meeting',
    message: `Hi,

This is a reminder for our design review meeting scheduled for tomorrow at 2 PM. Please be prepared to discuss the latest wireframes and user flows.

See you there!

Chloe`,
    date: '09 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 27,
    from: 'Daniel Young',
    to: 'me',
    subject: 'Performance Report',
    message: `Hello,

The performance report for Q1 is ready. Please review the attached document and let me know if you have any questions or need further analysis.

Best,
Daniel`,
    date: '11 Apr',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'performance-q1.pdf', size: '1.3 MB', type: 'pdf' }],
  },
  {
    id: 28,
    from: 'Zoe Hall',
    to: 'me',
    subject: 'Welcome Lunch',
    message: `Hi Team,

We're organizing a welcome lunch for the new joiners next Monday. Please let me know if you can make it and if you have any dietary preferences.

Looking forward to seeing everyone!

Zoe`,
    date: '13 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 29,
    from: 'Matthew Allen',
    to: 'me',
    subject: 'Release Notes',
    message: `Hello,

The release notes for version 2.0 are attached. Please review the changes and share your feedback. The deployment is scheduled for next week.

Thanks,
Matthew`,
    date: '15 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'release-notes-v2.pdf', size: '700 KB', type: 'pdf' }],
  },
  {
    id: 30,
    from: 'Scarlett Lewis',
    to: 'me',
    subject: 'Training Session Materials',
    message: `Hi,

Please find attached the materials for the upcoming training session. Let me know if you have any questions or need additional resources.

Best regards,
Scarlett`,
    date: '17 Apr',
    isUnread: false,
    isStarred: true,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'training-materials.zip', size: '2.2 MB', type: 'zip' }],
  },
  {
    id: 31,
    from: 'David Clark',
    to: 'me',
    subject: 'Bug Report',
    message: `Hello,

I've found a bug in the latest build. Please see the attached screenshot and steps to reproduce. Let me know if you need more information.

Thanks,
David`,
    date: '19 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'bug-screenshot.png', size: '350 KB', type: 'png' }],
  },
  {
    id: 32,
    from: 'Layla Robinson',
    to: 'me',
    subject: 'Sprint Planning',
    message: `Hi Team,

Sprint planning is scheduled for Thursday at 10 AM. Please review the backlog and be ready to discuss priorities and estimates.

See you all then!

Layla`,
    date: '21 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 33,
    from: 'Joseph Walker',
    to: 'me',
    subject: 'Annual Survey',
    message: `Dear Colleague,

It's time for our annual employee survey. Your feedback is important and will help us improve our workplace. Please complete the survey by the end of the week.

Thank you,
Joseph`,
    date: '23 Apr',
    isUnread: false,
    isStarred: true,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 34,
    from: 'Penelope Adams',
    to: 'me',
    subject: 'Document Review',
    message: `Hi,

Could you please review the attached document and provide your comments? Your expertise is greatly appreciated.

Best,
Penelope`,
    date: '25 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'document-review.docx', size: '110 KB', type: 'docx' }],
  },
  {
    id: 35,
    from: 'Samuel Baker',
    to: 'me',
    subject: 'Code Review Feedback',
    message: `Hello,

I've completed the code review for your latest commit. Please see my comments in the attached file. Let me know if you have any questions.

Thanks,
Samuel`,
    date: '27 Apr',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'code-review.txt', size: '15 KB', type: 'txt' }],
  },
  {
    id: 36,
    from: 'Victoria Carter',
    to: 'me',
    subject: 'Project Kickoff',
    message: `Hi Team,

The project kickoff meeting is scheduled for Monday at 9 AM. Please review the agenda and be prepared to discuss your roles and responsibilities.

Looking forward to a successful project!

Victoria`,
    date: '29 Apr',
    isUnread: true,
    isStarred: true,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 37,
    from: 'Andrew Mitchell',
    to: 'me',
    subject: 'Expense Report Submission',
    message: `Hello,

Please submit your expense reports for April by the end of the week. Use the attached template for consistency. Let me know if you have any questions.

Best,
Andrew`,
    date: '01 May',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'expense-template.xlsx', size: '45 KB', type: 'xlsx' }],
  },
  {
    id: 38,
    from: 'Madison Perez',
    to: 'me',
    subject: 'Team Outing Photos',
    message: `Hi Everyone,

I've uploaded the photos from our recent team outing. Please find them attached. It was great to see everyone having fun!

Best,
Madison`,
    date: '03 May',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'outing-photos.zip', size: '8.5 MB', type: 'zip' }],
  },
  {
    id: 39,
    from: 'Ethan Morris',
    to: 'me',
    subject: 'System Downtime Alert',
    message: `Dear User,

We are experiencing unexpected system downtime. Our team is working to resolve the issue as quickly as possible. We apologize for the inconvenience and will keep you updated.

Thank you for your patience.

Ethan`,
    date: '05 May',
    isUnread: false,
    isStarred: true,
    hasAttachment: false,
    senderAvatar: '/images/faces/face.webp',
  },
  {
    id: 40,
    from: 'Sofia Reed',
    to: 'me',
    subject: 'Monthly Newsletter',
    message: `Hello,

Please find attached the monthly newsletter. It includes updates on our projects, upcoming events, and team achievements. Let me know if you have any questions.

Best regards,
Sofia`,
    date: '07 May',
    isUnread: false,
    isStarred: false,
    hasAttachment: true,
    senderAvatar: '/images/faces/face.webp',
    attachments: [{ name: 'newsletter-may.pdf', size: '2.1 MB', type: 'pdf' }],
  },
];

// Helper function to get email by ID
export const getEmailById = (id: number): Email | undefined => {
  return emailsData.find((email) => email.id === id);
};

// Helper function to get inbox emails (for backward compatibility)
export const getInboxEmails = (): Email[] => {
  return emailsData;
};

// Helper function to get unread count
export const getUnreadCount = (): number => {
  return emailsData.filter((email) => email.isUnread).length;
};

// Helper function to get starred emails
export const getStarredEmails = (): Email[] => {
  return emailsData.filter((email) => email.isStarred);
};

// Helper function to get emails with attachments
export const getEmailsWithAttachments = (): Email[] => {
  return emailsData.filter((email) => email.hasAttachment);
};
