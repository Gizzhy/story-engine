// Mock data for the UI-only build phase. Stands in for a real pipeline run so the
// output and review views can be built against something coherent. The blueprint and
// the generation describe the SAME fictional story ("The Glasswater") so the two
// states read consistently when wired together.

import type { Blueprint, Generation } from './types';

const TITLE_OPTIONS = [
  'I Took the Night Audit Job at a Hotel Where Room 9 Never Checks Out',
  'For 30 Years, the Same Guest Has Slept in Room 9. I Was Hired to Keep It That Way.',
  'The Hotel Pays You to Ignore Room 9. On My First Night, I Stopped Ignoring It.',
  'Every Night the Ledger Says Room 9 Is Empty. Every Night I Hear Someone Inside.',
  'I Found Out Why the Glasswater Hotel Has Never Once Cleaned Room 9',
];

export const mockBlueprint: Blueprint = {
  storyBrief: {
    genre: 'Supernatural mystery · slow-burn thriller',
    setting:
      'The Glasswater Hotel, a fog-bound alpine resort past its prime, in the dead hours between midnight and dawn. Long carpeted corridors, a brass-keyed front desk, a basement records room, and an elevator that only the night staff still trust.',
    narrativePOV: 'First-person past tense',
    premise:
      'The Glasswater is a once-grand resort kept alive by a single, impossible occupancy. Room 9 is paid through in cash, never serviced, never disturbed. The new auditor is told only one rule: the room is full, the room is fine, leave it be. When the building starts answering questions he never asks aloud, he has to decide whether the hotel is haunted by a guest — or by the people who keep covering for one.',
  },
  titleOptions: TITLE_OPTIONS,
  logline:
    'A burned-out night auditor takes a quiet graveyard shift at a failing mountain hotel, only to discover that its most loyal guest has been checking into the same room every night for thirty years — and that the job he was really hired for is to make sure no one ever asks why.',
  characters: [
    {
      name: 'Daniel Reese',
      role: 'lead',
      age: 'Late 30s',
      relationship: 'The newly hired night auditor; the narrator.',
      traits: 'Observant, insomniac, allergic to mysteries he cannot close.',
      arc: 'Arrives wanting nothing but a paycheck and silence; leaves having traded both for the truth.',
    },
    {
      name: 'Marguerite Vell',
      role: 'supporting',
      age: 'Early 60s',
      relationship: 'The day manager who hired Daniel and guards the hotel.',
      traits: 'Composed, evasive, fiercely protective of the hotel.',
      arc: 'Reveals she is not hiding a ghost but a promise she made long ago.',
    },
    {
      name: 'The Guest in Room 9',
      role: 'supporting',
      age: 'Indeterminate; appears to be Daniel’s double',
      relationship: "The standing occupancy Daniel is unknowingly bound to.",
      traits: 'Never seen in full; known only by a light, a sound, a signature.',
      arc: 'Resolves from rumor into a person with a reason to stay.',
    },
  ],
  segments: [
    {
      index: 1,
      title: 'The one rule',
      beat: 'Setup',
      wordTarget: 1200,
      goal: 'Establish Daniel, the dying hotel, the graveyard shift, and the single rule about Room 9.',
      endsOn: 'He notices Room 9 is paid through the end of the century — in advance.',
    },
    {
      index: 2,
      title: 'The ledger that lies',
      beat: 'Inciting incident',
      wordTarget: 1200,
      goal: 'Daniel finds the occupancy records contradict themselves and the front-desk system.',
      endsOn: 'The night log shows a checkout he is certain no one performed.',
    },
    {
      index: 3,
      title: 'The light under the door',
      beat: 'Rising action',
      wordTarget: 1200,
      goal: 'First direct contact — sound and light from a room that should be sealed.',
      endsOn: 'A room key he never touched is warm in his pocket.',
    },
    {
      index: 4,
      title: 'The basement of names',
      beat: 'Midpoint',
      wordTarget: 1200,
      goal: 'In the records room he traces thirty years of the same guest under different names.',
      endsOn: 'Every alias shares one detail — and it is his own middle name.',
    },
    {
      index: 5,
      title: "Marguerite's promise",
      beat: 'Escalation',
      wordTarget: 1200,
      goal: 'The manager finally explains what the hotel is really protecting, and from whom.',
      endsOn: 'She tells him the last auditor asked the same questions, the same week.',
    },
    {
      index: 6,
      title: 'Nine',
      beat: 'Climax',
      wordTarget: 1200,
      goal: 'Daniel opens Room 9 and meets what has been waiting inside it.',
      endsOn: 'The guest greets him by name, as if he is late.',
    },
    {
      index: 7,
      title: 'Checkout',
      beat: 'Resolution',
      wordTarget: 1200,
      goal: 'The truth of the standing occupancy lands; Daniel chooses what to do with it.',
      endsOn: 'The next morning a new ad runs: night auditor wanted, one rule.',
    },
  ],
};

export const mockGeneration: Generation = {
  title: TITLE_OPTIONS[1],
  titleOptions: TITLE_OPTIONS,
  durationMinutes: 60,
  wordCount: 1492,
  description:
    "A burned-out night auditor takes the quietest job in the mountains — until he learns the Glasswater Hotel's most loyal guest has checked into Room 9 every night for thirty years, and that he was hired to make sure no one ever asks why. A slow-burn supernatural mystery about debt, doubles, and the one rule that keeps a dying hotel standing. Settle in, turn the lights low, and whatever you do, don't knock on Room 9.",
  tags: [
    'narrated story',
    'creepypasta',
    'hotel mystery',
    'night shift horror',
    'supernatural thriller',
    'slow burn mystery',
    'scary stories for sleep',
    'atmospheric horror',
    'ghost story',
    'mystery narration',
  ],
  hashtags: [
    '#scarystories',
    '#creepypasta',
    '#narratedstory',
    '#hotelmystery',
    '#horrorstory',
    '#nightshift',
  ],
  hooks: [
    {
      index: 1,
      moment: "The one rule Daniel is handed about Room 9.",
      voiceover: "Room 9 is occupied. It is paid. You do not knock.",
      voiceoverSource: "story",
      imagePrompt:
        "Slow push-in down a long, dim ninth-floor hotel corridor toward a single closed door with a brass '9', a thin blade of warm golden light leaking from beneath it and pulsing almost imperceptibly; low fog drifts across patterned carpet. Handheld micro-shake, deep teal shadows against amber glow, volumetric light, ominous hush, photoreal cinematic, shallow depth of field, 35mm grain.",
      motion: "Slow push-in with a faint handheld micro-shake.",
    },
    {
      index: 2,
      moment: "A checkout appears in Daniel's own handwriting.",
      voiceover:
        "A checkout I had not performed — in handwriting that was unmistakably my own.",
      voiceoverSource: "story",
      imagePrompt:
        "Slow overhead crane descent onto an open leather occupancy ledger under a desk lamp, the camera settling as a single line of handwriting finishes itself with no hand present, ink glistening wet; a clock in soft focus ticks toward 3:14. Subtle dolly, warm lamplight pooled in cold blue dark, eerie stillness broken by motion, photoreal, shallow focus, film grain.",
      motion: "Overhead crane descent settling to a stop.",
    },
    {
      index: 3,
      moment: "Arrival at the fog-bound Glasswater, one light already on.",
      voiceover:
        "The hotel hires its night people the way it does everything now — quietly.",
      voiceoverSource: "story",
      imagePrompt:
        "A lone bus carves up a fog-swallowed mountain road at dusk toward a vast faded alpine hotel, the camera tracking alongside then craning up to the hotel's many dark windows — all black except one, where a warm light clicks on. Sweeping aerial-to-tracking move, muted teal-and-amber palette, melancholy grandeur, cinematic wide, atmospheric haze, photoreal.",
      motion: "Tracking alongside, then craning up the facade.",
    },
    {
      index: 4,
      moment: "The auditor before him asked one question too many.",
      voiceover:
        "The last auditor asked the same questions. Then he checked in — and never checked out.",
      voiceoverSource: "story",
      imagePrompt:
        "Push past a weary night auditor at a brass front desk as he looks up, the camera drifting toward the elevator's brass arrow climbing on its own to the 9th floor while no one waits; lobby chandeliers flicker half-lit. Smooth gliding dolly, warm desk light against deep shadow, creeping dread, photoreal cinematic, shallow depth of field, subtle grain.",
      motion: "Gliding dolly past the desk toward the elevator.",
    },
    {
      index: 5,
      moment: "Every alias hides the same initial — his own.",
      voiceover: "Every name they used was a word for what fire leaves behind.",
      voiceoverSource: "story",
      imagePrompt:
        "Slow rack-focus across a basement wall of yellowed registration cards as the camera glides past decades of signatures, pulling focus to a repeated underlined initial 'A', dust motes swirling in a single hanging bulb's light. Lateral tracking move, cold damp blue-grey tones cut by one warm bulb, unsettling reveal, film-noir mood, photoreal, fine grain.",
      motion: "Lateral tracking move with a pull to sharp focus.",
    },
  ],
  suggestedHookCount: 4,
  thumbnailPrompt:
    "Bold high-contrast YouTube thumbnail, 16:9: a dim hotel corridor at night with a single heavy door marked with a brass '9' glowing from an eerie golden light spilling beneath it, low fog seeping across patterned carpet, a lone silhouetted man frozen mid-step before the door. Dramatic cinematic lighting, deep teal shadows against warm amber glow, high saturation, sharp focus, ominous and mysterious, generous negative space on the left for large bold title text.",
  characters: [
    {
      name: 'Daniel August Reese',
      identity:
        "A lean man in his late thirties with tired, watchful insomniac eyes, short dark hair going grey at the temples, three-day stubble, fair skin, a narrow face with sharp cheekbones — the worn look of someone who lives at night.",
      baselineOutfit:
        "A plain charcoal overcoat over a rumpled white button-down shirt.",
      referencePrompt:
        "A lean man in his late thirties with tired, watchful insomniac eyes, short dark hair going grey at the temples, three-day stubble, fair skin, a narrow face with sharp cheekbones. Wearing a plain charcoal overcoat over a rumpled white button-down shirt.\n\nStyle: photorealistic, ultra-cinematic, 16:9 widescreen; eye-level, shallow depth of field, sharp focus; lighting — muted teal-and-amber, low-key cinematic intensity; ultra-realistic 8K detail, photorealistic skin texture, neutral color grading.",
    },
    {
      name: 'Marguerite Vell',
      identity:
        "A composed woman in her early sixties, silver hair in a low neat twist, sharp attentive grey eyes, pale lined skin, a dignified oval face.",
      baselineOutfit:
        "A tailored charcoal wool cardigan over a high-collared cream blouse, a small brass key pinned at the lapel.",
      referencePrompt:
        "A composed woman in her early sixties, silver hair in a low neat twist, sharp attentive grey eyes, pale lined skin, a dignified oval face. Wearing a tailored charcoal wool cardigan over a high-collared cream blouse, a small brass key pinned at the lapel.\n\nStyle: photorealistic, ultra-cinematic, 16:9 widescreen; eye-level, shallow depth of field, sharp focus; lighting — muted teal-and-amber, low-key cinematic intensity; ultra-realistic 8K detail, photorealistic skin texture, neutral color grading.",
    },
    {
      name: 'The Guest in Room 9',
      identity:
        "A man who uncannily resembles Daniel — the same jaw, the same insomniac eyes — but older, with greying hair and a settled, serene expression; fair skin, a calm lined face.",
      baselineOutfit: "A soft, worn brown cardigan over a plain shirt.",
      referencePrompt:
        "A man who uncannily resembles Daniel — the same jaw, the same insomniac eyes — but older, with greying hair and a settled, serene expression; fair skin, a calm lined face. Wearing a soft, worn brown cardigan over a plain shirt.\n\nStyle: photorealistic, ultra-cinematic, 16:9 widescreen; eye-level, shallow depth of field, sharp focus; lighting — muted teal-and-amber, low-key cinematic intensity; ultra-realistic 8K detail, photorealistic skin texture, neutral color grading.",
    },
  ],
  scenes: [],
  segments: [
    {
      index: 1,
      text: "The Glasswater hires its night people the way it does everything now: quietly, and with the heat turned low. I came up the mountain on the last bus of the day, watched the fog swallow the road behind me, and arrived to find a hotel that had clearly been beautiful once and had decided, sometime in the last twenty years, that beautiful was too much work. The chandeliers were half-lit to save the bill. The carpet remembered a richer red than it could still show. Marguerite Vell met me at a front desk made of brass and patience, slid a single key across it, and walked me through a job that mostly amounted to staying awake while everyone else slept. Run the audit at two. Balance the day's charges. Don't let the boiler quit. And then, almost as an afterthought, the one thing she said twice so I'd be sure to keep it: Room 9 is occupied. It is paid. It is fine. You do not service it, you do not knock on it, you do not list it as vacant no matter what the screen tells you. I said that was easy enough. She didn't smile. I should have noticed that she didn't smile.",
      imagePrompt:
        "Cinematic wide shot of a weary man in a travel coat arriving in the lobby of a grand but faded alpine hotel at night, dense fog pressing against tall arched windows, half-lit crystal chandeliers, worn crimson carpet, a polished brass front desk where a composed older woman slides a single key toward him. Moody low-key lighting, deep shadows, muted amber-and-teal palette, 35mm film grain, atmospheric mystery, painterly photorealism.",
    },
    {
      index: 2,
      text: "The audit is a lonely kind of arithmetic, and I have always been good at lonely kinds of arithmetic. That first week I learned the building's sounds the way you learn a sleeping house — the tick of the radiators, the elevator settling on its cable, the wind testing the windows on the north face. The numbers behaved. The guests behaved; there were never more than a dozen. Only the ledger misbehaved. We keep two records at the Glasswater, the new system on the screen and the old leather occupancy book the night staff still sign by hand, a habit no one had bothered to kill. On the screen, Room 9 was a closed account, no balance, no name, a gray line the software refused to let me edit. In the book it was something stranger. The same room, signed for every single night, in a steady unhurried hand, going back further than the pages I was allowed to turn. And on my fourth night, near the bottom of a column I had filled in myself, I found a checkout stamped at 3:14 a.m. for Room 9 — a checkout I had not performed, in handwriting that was unmistakably my own.",
      imagePrompt:
        "Intimate close-up of an old leather hotel occupancy ledger open under a warm desk lamp, a column of handwritten signatures, a modern computer monitor glowing faintly in the soft-focus background showing a greyed-out room entry, a brass desk bell, a clock reading 3:14. Chiaroscuro lighting, warm lamplight against cold blue night, shallow depth of field, eerie quiet, cinematic photorealism.",
    },
    {
      index: 3,
      text: "I told myself I had done it half-asleep and forgotten. That story held until the light. It was 3:09 by the lobby clock when I walked the ninth-floor hall for no reason I could name, and from the gap beneath the door of Room 9 came a thin warm bar of light, the gold of a reading lamp, steady, lived-in. Behind the door, very softly, someone was turning pages. I stood there long enough to hear three of them turn. I did not knock — the rule had gone into me deeper than I'd realized — but I leaned close and said, quietly, that I hoped the guest had everything they needed. The page-turning stopped. The light did not. When I got back to the desk my hands were cold except for one pocket, which was warm, and in that pocket was a room key I had not been carrying, brass, worn smooth, the number 9 nearly rubbed away by thirty years of thumbs that were not mine.",
      imagePrompt:
        "A long dim ninth-floor hotel corridor at night, patterned carpet receding into darkness, ornate sconces barely glowing, a single closed door with a thin warm golden bar of light spilling from beneath it, faint dust suspended in the air, a man standing close with his head bowed to listen. Volumetric light, deep shadows, suspenseful mood, muted gold-and-charcoal palette, cinematic mystery-horror atmosphere, photorealistic.",
    },
    {
      index: 4,
      text: "The records room is in the basement, behind the boiler, and it smells like every January the hotel has ever survived. Marguerite had not forbidden it, which I took, generously, as permission. I went looking for Room 9 and found it everywhere. Different names on different decades — Mr. Ash, R. Cendre, a Mrs. Greaves, a Daniel Brand — checking in on the same date each year, paying the same way, cash folded into the book, never once checking out for good. The names looked unrelated until I lined them up and stopped reading them as names. Ash and cendre and greaves and brand: every alias was a word for what fire leaves behind. I almost laughed at how literary it was, how patient. And then I noticed the second thing they shared, the small middle initial repeated down thirty years of registrations, a single letter someone had insisted on keeping through every disguise. It was an A. My name is Daniel August Reese. I have never told a soul at the Glasswater my middle name.",
      imagePrompt:
        "A cramped hotel basement records room behind a rusted iron boiler, towering shelves of yellowed registration cards and leather ledgers, a single bare hanging bulb, a man bent over old documents spread across a wooden table, several names underlined in pencil. Dusty damp atmosphere, cold blue-grey tones cut by one warm pool of bulb light, film-noir lighting, intricate detail, unsettling, cinematic photorealism.",
    },
    {
      index: 5,
      text: "Marguerite found me in the basement at dawn, which meant she had come in early, which meant she had known I would be there. She did not pretend to be surprised. She made coffee in the records room on a hot plate older than I am and told me the part of the job that isn't in the listing. The Glasswater does not have a ghost, she said, and she said it like a woman defending family. It has a debt. Thirty years ago someone did a terrible thing to keep this hotel standing and someone else agreed to stay behind and hold the door shut from the inside, so that the thing would stay finished and the rest of us could go on serving breakfast. Room 9 is not haunted. Room 9 is occupied, exactly as I'd been told, by the person who pays the real bill. The night staff keep the rule because the rule is the rent. Then she set down her cup and told me the part she had not rehearsed: the last auditor found the ledger too, in his fourth week, asked these exact questions on this exact night. After that, she said, he checked in. He never checked out.",
      imagePrompt:
        "Early dawn light seeping through a small basement window into a hotel records room, an older woman in a cardigan pouring coffee from a battered hot plate into two cups that steam in the cold air, a younger man listening gravely across a table cluttered with old ledgers. Soft cold morning light blended with warm steam and lamp glow, somber intimate mood, muted palette, painterly cinematic realism, quiet emotional tension.",
    },
    {
      index: 6,
      text: "I should have taken the last bus down. Instead I rode the elevator to the ninth floor with a key that fit my hand too well and a middle name that had been waiting for me in a book for three decades. The hall was warm. The light under the door of Room 9 was on. The lock turned before I finished turning it. Inside, the room was smaller and kinder than the hotel deserved — a reading lamp, a chair, a book left open face-down the way my father used to leave them, and a man in the chair who looked up at me with no fear at all, only a mild, settled patience, the look of someone who has held a place in a long line and is relieved to finally hand it over. He had my jaw. He had my insomniac eyes. He closed the book, stood, and said my name — my whole name, the August and all — and added, gently, as if I were a guest who had taken a wrong turn in the dark: You're late. I kept the room warm for you.",
      imagePrompt:
        "Interior of a small, unexpectedly warm hotel room at night, a single reading lamp, a worn armchair, a hardback book left open face-down on the armrest, a calm seated man who uncannily resembles the protagonist looking up without fear, the protagonist silhouetted in the opening doorway. Warm amber light, intimate uncanny mood, soft long shadows, doppelganger tension, cinematic photorealism, fine detail.",
    },
    {
      index: 7,
      text: "There is a version of this story where I run, and I have told it to myself many times since. In the true one I sat down. He explained what holding the door costs and what it spares, and I understood that someone had always sat in that chair and someone always would, and that the only real question the Glasswater ever asks its night people is whether they would rather know or rather sleep. I am writing this at the brass desk, at 3:14 in the morning, balancing a day's charges that no longer fully concern me. Marguerite will find it and decide how much of it to keep. The man in Room 9 left this afternoon, on the first bus, into a fog that finally let go of the road; he had earned the going. Tomorrow the listing runs again in the mountain paper, the way it has for thirty years. Night auditor wanted. Quiet work. One rule. If you take it, and you will, the room is occupied. The room is paid. The room is fine. Do not service it. Do not knock. And whatever the screen tells you at the end of your fourth week — do not list it as vacant. It is me in there now. I kept the light on for you.",
      imagePrompt:
        "A man writing by lamplight at a polished brass hotel front desk in the dead of night, a clock on the wall reading 3:14, and through the tall lobby windows a lone bus pulling away down a mountain road into thinning dawn fog. Melancholy reflective mood, warm desk light against the cold blue exterior, cinematic wide composition, film grain, muted teal-and-amber palette, quietly haunting photorealism.",
    },
  ],
};
