/* ============================================================
   CINDI Kansenshi — Seed Content
   ------------------------------------------------------------
   This is the site's original News, Gallery, and Posts content,
   expressed as data instead of hardcoded HTML. On first load,
   shared.js copies these into localStorage (cindi_news_posts /
   cindi_gallery / cindi_posts) so the admin dashboard can edit
   or delete ANY item — including the ones the site shipped with
   — not just items added later. "Reset to original content" in
   the admin Security tab restores exactly what's in this file.
   Seed post bodies are trusted, site-authored HTML (trusted:true).
   Anything added later through the admin Posts form is plain
   text that gets turned into paragraphs safely — never raw HTML
   — so an admin account being misused can't inject scripts.
   ============================================================ */
(function (global) {
  'use strict';

  const news = [
    { id: 'seed-news-1', title: '50 Learners Receive New School Uniforms Ahead of Term 2', category: 'education', date: 'June 2026', image: 'images/news-uniforms.svg', excerpt: 'Thanks to a generous partnership with Copperbelt Threads Ltd, fifty of our children returned to school for Term 2 fully kitted out. For many, it was the first time they had owned a brand-new uniform. Headteacher Mrs. Mwelwa of Kansenshi Primary reported attendance at 98% in the first week — a record for the school.' },
    { id: 'seed-news-2', title: 'Community Garden Feeds 200 Families This Harvest Season', category: 'nutrition', date: 'April 2026', image: 'images/news-garden.svg', excerpt: 'Our caregiver empowerment programme yielded its biggest harvest yet, with 200 families receiving fresh produce from our 1-acre community garden.' },
    { id: 'seed-news-3', title: 'Mobile Clinic Serves 300+ Children in Kansenshi Ward', category: 'health', date: 'March 2026', image: 'images/news-clinic.svg', excerpt: 'In partnership with Ndola Teaching Hospital, our quarterly mobile clinic provided free check-ups, deworming, and immunisations to over 300 children.' },
    { id: 'seed-news-4', title: 'New VSLA Group Graduates 30 Caregivers with Savings Plans', category: 'empowerment', date: 'February 2026', image: 'images/news-vsla.svg', excerpt: 'Thirty caregivers completed their first Village Savings and Loan Association cycle, collectively saving over K45,000 throughout the 12-month programme.' },
    { id: 'seed-news-5', title: 'After-School Tutoring Centre Celebrates 100th Graduate', category: 'education', date: 'January 2026', image: 'images/news-tutoring.svg', excerpt: 'Our tutoring programme reached a milestone — the 100th child to complete the grade-level catch-up course and rejoin their mainstream class at full pace.' },
    { id: 'seed-news-6', title: 'Annual Christmas Party Brings Joy to 500 Children', category: 'community', date: 'December 2025', image: 'images/news-christmas.svg', excerpt: 'For the 10th year running, CINDI hosted its Annual Christmas Party — games, food, music, and gifts for 500 children across Kansenshi compound.' },
    { id: 'seed-news-7', title: 'HIV Awareness Day Draws 400 Community Members to Testing Drive', category: 'health', date: 'November 2025', image: 'images/news-hiv.svg', excerpt: 'On World AIDS Day, CINDI hosted a free voluntary testing and counselling drive, with 400 adults tested and 12 linked to ART treatment services.' }
  ];

  const gallery = [
    { id: 'seed-g-1', type: 'photo', url: 'images/program-education.svg', category: 'education', caption: 'After-school tutoring session', date: 'May 2026' },
    { id: 'seed-g-2', type: 'photo', url: 'images/news-tutoring.svg', category: 'education', caption: 'New textbooks for Grade 5 class', date: 'April 2026', layout: 'wide' },
    { id: 'seed-g-3', type: 'photo', url: 'images/news-uniforms.svg', category: 'education', caption: 'Uniform distribution day', date: 'June 2026' },
    { id: 'seed-g-4', type: 'photo', url: 'images/program-nutrition.svg', category: 'nutrition', caption: 'Daily hot meal at the centre', date: 'March 2026', layout: 'tall' },
    { id: 'seed-g-5', type: 'photo', url: 'images/news-garden.svg', category: 'nutrition', caption: 'Community garden harvest season', date: 'April 2026' },
    { id: 'seed-g-6', type: 'photo', url: 'images/news-vsla.svg', category: 'nutrition', caption: 'Monthly household food packages', date: 'February 2026' },
    { id: 'seed-g-7', type: 'photo', url: 'images/program-health.svg', category: 'health', caption: 'Quarterly mobile health clinic', date: 'March 2026', layout: 'wide' },
    { id: 'seed-g-8', type: 'photo', url: 'images/news-hiv.svg', category: 'health', caption: 'HIV awareness drive — 400 tested', date: 'November 2025' },
    { id: 'seed-g-9', type: 'photo', url: 'images/testimonial-6.svg', category: 'health', caption: 'Child wellness screening', date: 'January 2026' },
    { id: 'seed-g-10', type: 'photo', url: 'images/program-empowerment.svg', category: 'empowerment', caption: 'Soap-making skills training', date: 'January 2026' },
    { id: 'seed-g-11', type: 'photo', url: 'images/about-community.svg', category: 'empowerment', caption: 'VSLA graduation ceremony', date: 'February 2026', layout: 'tall' },
    { id: 'seed-g-12', type: 'photo', url: 'images/testimonial-5.svg', category: 'empowerment', caption: 'Grandmother Esther at her stall', date: 'March 2026' },
    { id: 'seed-g-13', type: 'photo', url: 'images/news-christmas.svg', category: 'events', caption: 'Annual Christmas Party 2025', date: 'December 2025', layout: 'wide' },
    { id: 'seed-g-14', type: 'photo', url: 'images/impact-quote-1.svg', category: 'events', caption: 'International donor delegation visit', date: 'April 2026' },
    { id: 'seed-g-15', type: 'photo', url: 'images/story-grace.svg', category: 'events', caption: 'End-of-year concert performance', date: 'November 2025' },
    { id: 'seed-g-16', type: 'photo', url: 'images/hero.svg', category: 'centre', caption: 'The CINDI main building', date: '2026' },
    { id: 'seed-g-17', type: 'photo', url: 'images/news-clinic.svg', category: 'centre', caption: 'The feeding hall — seats 150 children', date: '2025', layout: 'wide' },
    { id: 'seed-g-18', type: 'photo', url: 'images/news-garden.svg', category: 'centre', caption: 'Community vegetable garden — 1 acre', date: '2025' }
  ];

  const posts = [
    {
      id: 'seed-post-1', category: 'story', trusted: true,
      title: "Grace's Journey: From Hunger to Honour Roll",
      author: 'Grace Banda, Executive Director', authorImage: 'images/team-grace.svg',
      date: 'June 5, 2026', read: '6 min read', image: 'images/story-grace.svg',
      excerpt: 'She arrived at our gate at age nine — no shoes, no school bag, three months behind on fees. Today she is top of her class and dreams of becoming a doctor. This is her story, told in her own words and mine.',
      body: "<p>Grace was nine years old when she first appeared at our gate. No shoes. No school bag. Three months behind on school fees. Her grandmother, Esther, had walked her across the compound early on a Monday morning, clutching a handwritten note from a neighbour who had heard about CINDI.</p><p>I remember the morning clearly. I was reviewing our feeding programme registers when our Community Liaison Officer, Daniel, knocked on my office door. 'There's a little girl at the gate,' he said. 'Her grandmother says she hasn't eaten since yesterday morning.'</p><p>We brought Grace in. We gave her ugali, beans, and a glass of maheu. She ate in silence, her eyes wide, watching the other children in the courtyard. When she finished, she looked up at me and said: 'Is there more?'</p><blockquote>There is always more, Grace. That is what CINDI means.</blockquote><p>Within a week, Grace was enrolled at Kansenshi Primary School. Within a month, she had caught up with her class. Within a year, she was top of her class in Mathematics and Science.</p><p>Today, Grace is 13 years old, in Grade 7, and she wants to be a doctor. Not just any doctor — a paediatrician who will come back to Kansenshi and work in the compound where she grew up.</p><p>Stories like Grace's remind us why we wake up every morning. Behind every statistic — every '1,200 children supported', every '85% school completion rate' — is a name, a face, and a future worth fighting for.</p><p>CINDI does not create these stories. The children do. We simply make sure they have enough to eat, enough to learn with, and enough people cheering for them that they dare to dream.</p>"
    },
    {
      id: 'seed-post-2', category: 'field-note', trusted: true,
      title: 'A Tuesday in Kansenshi: What Our Day Actually Looks Like',
      author: 'Daniel Tembo, Community Liaison', authorImage: 'images/team-daniel.svg',
      date: 'May 20, 2026', read: '4 min read', image: 'images/program-education.svg',
      excerpt: 'No headlines. No ceremonies. Just a Tuesday — and what it takes to run a children\u2019s centre in the middle of a Zambian compound.',
      body: "<p>People often ask us what a typical day looks like at CINDI. The honest answer is: there is no typical day. But Tuesday last week came close.</p><p>By 7:30am, Daniel had already unlocked the gate, swept the courtyard, and started the cooking fire with the kitchen team. By 8am, the first children arrived for breakfast — a warm porridge made from our own maize. Forty-three children, seated, fed, before school started.</p><p>By 9am, the courtyard was quiet. The children were in school. Our social worker, Mable, drove to three different households to check on children who had been absent the previous week. One had been sick. One had been kept home to look after a younger sibling. One — a girl named Precious — had run away from an abusive uncle. Mable stayed at that house for three hours.</p><p>By 2pm, the children began returning. The tutoring centre filled up: 38 children, two volunteer teachers, and one very ancient whiteboard that we really need to replace.</p><p>By 4:30pm, the last child had left. The kitchen team was washing pots. Daniel locked the gate. Another Tuesday in Kansenshi.</p><p>This is what your donations fund. Not headlines. Tuesdays.</p>"
    },
    {
      id: 'seed-post-3', category: 'reflection', trusted: true,
      title: 'What 12 Years in This Work Has Taught Me',
      author: 'Grace Banda, Executive Director', authorImage: 'images/team-grace.svg',
      date: 'April 12, 2026', read: '7 min read', image: 'images/about-community.svg',
      excerpt: 'Humility. Patience. The power of questions. Our Executive Director reflects on a decade of learning from the community she serves.',
      body: "<p>Twelve years ago I thought I understood poverty. I had read about it, studied it, written essays about it. Then I came to Kansenshi and I understood nothing.</p><p>The first thing this work teaches you is humility. You cannot arrive in a community with solutions. You must arrive with questions. Good questions, patient questions, questions you are willing to sit with for a long time.</p><p>The second thing it teaches you is that community members are never passive recipients. They are the experts. The grandmothers who have been raising orphaned grandchildren for twenty years know more about resilience than any textbook. Our job is to resource their knowledge, not replace it.</p><p>The third thing — and perhaps the hardest — is that this work is slow. Real change is slow. A child who enters our programme at age seven will not show the full returns of that investment until they are twenty-five. You have to be comfortable with not seeing the ending.</p><p>But sometimes — on a good Tuesday, with the sun out, and the courtyard full of children doing their homework — you get a glimpse. And that glimpse is enough.</p>"
    },
    {
      id: 'seed-post-4', category: 'impact', trusted: true,
      title: 'The Numbers Behind 1,200 Children',
      author: 'Charity Phiri, Finance Officer', authorImage: 'images/team-charity.svg',
      date: 'March 28, 2026', read: '5 min read', image: 'images/impact-quote-1.svg',
      excerpt: 'Our Finance Officer breaks down exactly what \u20181,200 children supported\u2019 means — meal by meal, book by book, clinic visit by clinic visit.',
      body: "<p>When we say we support 1,200 children, what does that actually mean? Let me break it down.</p><p>680 children are enrolled in our education support programme — their school fees, uniforms, and textbooks are fully covered. Of those, 312 attend our after-school tutoring centre at least three times a week.</p><p>420 children receive a daily hot meal at our centre, five days a week. That is 2,100 meals per week, or roughly 62,400 meals per year. The ingredients come from two sources: local market purchases (funded by donors) and our own community garden (which produced 2.1 tonnes of vegetables last season).</p><p>We run four health clinic days per year, in partnership with Ndola Teaching Hospital. Last year, 312 children received check-ups, deworming, and where needed, referrals to specialist care. Eight children were identified with previously undiagnosed conditions — including two with significant anaemia and one with early-stage tuberculosis. All eight received treatment.</p><p>On the caregiver side: 450 households are enrolled in at least one of our empowerment programmes. Thirty caregivers graduated from our VSLA programme in February, collectively saving K45,000.</p><p>These are not abstract numbers. Each one is a decision made in a budget meeting, a trip to the market, a form signed, a phone call answered. Your donations make each of these decisions possible.</p>"
    },
    {
      id: 'seed-post-5', category: 'community', trusted: true,
      title: "Grandmother Esther's Soap Business: A Year On",
      author: 'Joseph Mwale, Programs Manager', authorImage: 'images/team-joseph.svg',
      date: 'February 10, 2026', read: '4 min read', image: 'images/testimonial-5.svg',
      excerpt: 'At 70, Esther thought skills training was for young people. One year later, she runs a market stall, earns four times her pension, and all three grandchildren are in school.',
      body: "<p>When we enrolled Grandmother Esther in our soap-making skills training last January, she was 70 years old, raising three grandchildren alone, and surviving on a widower's pension that amounted to less than K200 a month.</p><p>'I thought it was for young people,' she told me at the enrolment session. 'Why would someone my age need a business?' I told her she needed it for the same reason anyone does: to feed her family and sleep without worry.</p><p>Esther completed the four-week training programme. She received a starter kit — a hot plate, moulds, fragrance, and caustic soda — funded by a small grant from our empowerment budget.</p><p>One year later, Esther sells soap at the Kansenshi market every Tuesday and Friday. She makes roughly K800 per month — four times her pension. Her three grandchildren are enrolled in school, with fees covered partly by her income and partly by our education programme.</p><p>'I never thought at 71 I would have my own business,' she told me last week, still slightly disbelieving. 'But here I am. And my children are in school.'</p><p>Here she is, indeed.</p>"
    },
    {
      id: 'seed-post-6', category: 'field-note', trusted: true,
      title: 'What the Garden Taught Us About Dignity',
      author: 'Joseph Mwale, Programs Manager', authorImage: 'images/team-joseph.svg',
      date: 'January 8, 2026', read: '3 min read', image: 'images/news-garden.svg',
      excerpt: "We planted it to reduce food costs. What we didn't expect was what it would do to how people see themselves.",
      body: "<p>When we planted the community garden in 2021, we thought we were solving a food security problem. We were wrong — or rather, we were only half right.</p><p>The garden did solve a food security problem. Last season it produced 2.1 tonnes of vegetables, which fed directly into our cooking programme and reduced our food purchasing costs by 18%.</p><p>But it did something else we did not expect. It gave the caregivers who tend it a sense of ownership over the programme. On Wednesday mornings, when the gardening team arrives with their hoes and their thermoses of tea, they are not coming to receive help. They are coming to do their work.</p><p>One of the gardeners — a woman named Agnes who lost her husband and two of her children to HIV — told me: 'When I pull a weed, I am not a poor person being helped. I am a farmer doing my job. It is a small thing. But it is everything.'</p><p>Dignity, it turns out, is not a bonus. It is the whole point.</p>"
    },
    {
      id: 'seed-post-7', category: 'reflection', trusted: true,
      title: 'A Letter to Our Donors',
      author: 'Grace Banda, Executive Director', authorImage: 'images/team-grace.svg',
      date: 'December 31, 2025', read: '3 min read', image: 'images/impact-quote-3.svg',
      excerpt: 'A year-end letter from our Executive Director — a personal thank-you to everyone who made 2025 possible.',
      body: "<p>Dear Friend,</p><p>As 2025 closes, I want to write to you — not as a donor, but as a partner in something that truly matters.</p><p>This year, you helped us feed 62,400 meals. You helped 680 children stay in school. You helped 30 grandmothers graduate from a savings programme and dare to imagine a different future. You helped our mobile clinic catch eight children with illnesses they did not know they had.</p><p>None of this happened in a press release. It happened on ordinary mornings, in a compound in Ndola, because people like you decided that children they will likely never meet deserved a chance.</p><p>I know that giving money to an organisation you cannot see takes faith. I want you to know that faith is honoured here, carefully, with full accountability, and with deep gratitude.</p><p>Thank you. From the children, from their caregivers, and from every member of our team — thank you.</p><p>With hope and gratitude,<br><strong>Grace Banda</strong><br><em>Executive Director, CINDI Kansenshi</em></p>"
    }
  ];

  global.CindiSeed = { news, gallery, posts };
})(window);
