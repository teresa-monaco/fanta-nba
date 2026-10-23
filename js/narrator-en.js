// narrator-en.js — the English commentary, line for line with narrator.js.
//
// Same rule as the Italian: the narrator NEVER makes anything up. Every line
// comes from a factor the engine really computed or from a real box score
// row. The sarcasm is in HOW it's said, never in WHAT. Same tone: roast the
// team, the tactics and the performance — never the person.
//
// Same placeholders: {T} team, {O} opponent, {L} loser, {p} player, {n}
// number, plus the factor's data fields.

export const FACTOR_LINES = {
  'fuori-ruolo': [
    '{T} lines up {names}: like asking the pastry chef to rewire the house. It works until you touch something.',
    '{names}. Someone on {T} is doing a job they have never done, and it shows on every single possession.',
    'On {T} somebody is playing out of position ({names}) with the face of someone hoping nobody notices. Everybody noticed.',
  ],
  'no-spacing': [
    '{T} has {shooters} real shooters: the defense could park a bus in the paint and nobody would complain.',
    '{T}\'s floor is so cramped the teammates keep stepping on each other\'s feet. The defense guards four square meters and gets bored.',
    '{T} attacks as if the three-pointer hadn\'t been invented yet. In 2026. With this roster.',
  ],
  'spacing-totale': [
    'With {shooters} shooters on the floor {T} stretches the defense until it tears. Every closeout leaves someone else open, and {T} always finds him.',
    '{T} keeps four men beyond the arc: defending becomes a choice of which disaster to suffer.',
  ],
  'no-playmaker': [
    '{T}\'s best passer tops out at {best}. Translation: the offense is a collection of improvisations, some of them involuntary.',
    'Nobody on {T} can organize anything. When plan A fails there is no plan B, there is a random shot.',
    '{T} plays without a point guard. In tough moments the ball goes around until someone, out of fatigue, shoots.',
  ],
  'troppe-bocche': [
    '{T} has more players demanding the ball than there are balls. There is, let\'s remember, one ball.',
    '{T} bought five first options. Now somebody has to tell four of them they picked the wrong team.',
    'Too many stars on {T}: everyone waits their turn with the face of someone who has no intention of waiting.',
  ],
  'ferro-scoperto': [
    '{T}\'s rim is guarded like a door left open. Walk in, lay it up, say thanks.',
    'In the paint {T} offers table service. The opponents order, {T} serves.',
    '{T} protects the basket with the enthusiasm of someone whose shift is already over.',
  ],
  'anello-debole': [
    'The opponents figured out {T}\'s weak spot right away and spent the series attacking {worst}.',
    '{T} has a star and then nothing: {n} players below the bar, and all five of them take the floor.',
    'Against {T} the defense picks where to go: it picks {worst}, every time.',
  ],
  'quintetto-piccolo': [
    '{T} is so small it has to chip in for rebounds. And it still loses them.',
    '{T}\'s lineup wins every race and loses everything that happens above ten feet.',
    'Under the basket {T} doesn\'t defend: it watches.',
  ],
  'violino-sbagliato': [
    '{T} gives the ball to {chosen} while {best} watches. A brave choice, in the worst sense of the word.',
    '{T}\'s first option is {chosen}. {T}\'s first option should be {best}. These two lines explain the series.',
    'Someone on {T} decided {chosen} should do the scoring. Nobody had the heart to tell him.',
  ],
  'star-usage': [
    '{player} takes everything. The other four are on the floor mostly for decoration.',
    'Everything goes through {player}: an excellent plan while it works, and a serious problem thirty seconds later.',
    '{player} plays, {T} watches. Four players paid to attend a basketball game.',
  ],
  'star-contenuta': [
    'Defending {T} is simple: take the ball away from one guy and the other four start studying the hardwood.',
    'An offense with one idea met a defense built for exactly that idea. Guess how it ended.',
  ],
  'iso-talento': [
    '{T}\'s two first options create their own shots, which is handy, since nobody else would ever create one for them.',
    '{T} goes one-on-one and wins with talent what it can\'t win with ideas.',
  ],
  'iso-ritmo': [
    'Isolation slows {T} down so much the defense has time to set up, breathe and take notes.',
  ],
  'pnr-coppia': [
    '{T}\'s pick and roll forces the defense to choose on every screen. Every available choice is wrong.',
    '{T}\'s pick and roll pair produces advantages with the regularity of a home appliance.',
  ],
  'pnr-difesa-lenta': [
    'The opposing defense switches on screens at the speed of bureaucracy. {T} attacks right there.',
  ],
  'post-peso': [
    '{T} has real weight in the post: the defense has to double, and doubling splits it apart on its own.',
    '{T}\'s big man took over the paint and changed the locks.',
  ],
  'post-muro': [
    '{T} chose to attack the best-protected paint in the building. Congratulations on the courage, condolences on the result.',
    'Every post-up by {T} ends against a wall. Not metaphorically: an actual wall.',
  ],
  'post-scarichi': [
    'On the double team {T} kicks it out and the shooters do the rest. Simple, ancient, lethal.',
  ],
  'ferro-atletismo': [
    '{T} attacks the rim nonstop: fouls, free throws, the defense in the bonus before halftime.',
  ],
  'ferro-muro': [
    '{T} comes back with more blocked shots than baskets. At some point you stop trying, but {T} hasn\'t stopped.',
  ],
  'tre-volume': [
    '{T} shoots threes until the net begs for mercy.',
    '{T}\'s perimeter forces closeouts on everyone. Closing out on everyone, with this defense, is not a realistic option.',
  ],
  'tr-atletismo': [
    '{T} runs on every recovered ball and scores before the others are done complaining to the referee.',
  ],
  'tr-pesantezza': [
    'The opposing lineup is too heavy to keep up with {T}. By the end they weren\'t running anymore: they were walking.',
  ],
  'motion-armonia': [
    'The motion offense puts {T} back in order: the ball moves and nobody stands still nursing a grudge.',
  ],
  'motion-lettura': [
    'Cuts, reads, off-ball movement: {T} finds open shots without having to ask anyone in particular.',
  ],
  'motion-un-creatore': [
    '{T}\'s motion is a lot of ball movement going nowhere. Choreography, not basketball.',
  ],
  'df-lungo': [
    '{T}\'s big man pulls the defense in and opens everything else, often without even touching the ball.',
  ],
  'df-tiro': [
    'When the ball comes out of the paint, {T}\'s shooters have been waiting there for a while.',
  ],
  'df-incompleto': [
    '{T}\'s inside-out game works halfway, because {T} bought half of the mechanism.',
  ],
  'eq-solido': [
    '{T} scares nobody and gives away nothing: the most boring team to watch and the most annoying to face.',
  ],
  'rimbalzi': [
    '{T} wins the glass by {diff} points: it plays with two extra possessions a quarter while the others watch the ball go up.',
    'On the boards {T} does whatever it wants. The opponents watch, as paying customers.',
  ],
  'taglia': [
    '{T} is {diff} steps bigger. In the paint it isn\'t a game, it\'s bullying.',
  ],
  'spacing-diff': [
    '{T} plays on an open floor, the others in a hallway. Same game, two different sports.',
  ],
  'difesa-perimetro': [
    'The opposing guards spent the series looking for a gap against {T}. There wasn\'t one.',
  ],
};

export const OPEN_BLOWOUT = [
  '{W} wins by {m}. {L} built this team in forty seconds of auction and it shows: even a vacuum cleaner has more offensive ideas.',
  '{L} loses by {m} and stares at the scoreboard as if it were the scoreboard\'s fault.',
  '{W} by {m}. Asked for a comment, {L} said he was trying out a lineup. He has been trying it for three nights.',
  '{W} by {m}. Someone take the team away from {L}: he is a danger to himself and others.',
  'It ends with a {m}-point margin. Midway through, {L} asked to swap teams. Denied.',
  '{W} played basketball. {L} took part, and not much.',
];
export const OPEN_CONTROL = [
  '{W} manages it with all the care {L} didn\'t put into the auction.',
  'Never in doubt. {L} believed for four minutes, then gave up with dignity. Without dignity, actually.',
  '{W} in control from the start. {L} in control of nothing, as usual.',
  'Easy win for {W}. {L} says "the team is there". It isn\'t.',
  '{W} takes it home without breaking a sweat. {L} is sweating, from embarrassment.',
];
export const OPEN_CLOSE = [
  'Balanced for three quarters, then {L} remembered being {L}.',
  '{L} really believed, which is the touching part. {W} less so, but won.',
  'Hard-fought, until {W} decided to stop playing with its food.',
  'For a moment {L} looked like a general manager. Then {W} scored and the illusion ended.',
];
export const OPEN_THRILLER = [
  'Decided on the last possession. {W} celebrates, {L} rewatches the game and the roster tonight and cries over both.',
  'Two points. Two. {L} will look for them in drawers for years, while {W} has already spent them.',
  'A heart-stopping finish: {W} gets the thrill, {L} gets the actual heart attack.',
  'It comes down to one possession, and {L} as always hands it to the wrong guy. {W} says thanks.',
];
export const OPEN_OT = [
  'Overtime: neither wanted to win. {L} wouldn\'t know what to do with it, {W} got there by accident.',
  'Forty minutes aren\'t enough for {L} to figure out how to close a game. Neither are forty-five: {W} wins.',
  'Overtime. {W} and {L} both tried their best to lose it, {L} with more talent.',
];
export const OPEN_2OT = [
  'Double overtime. {L} wanted to suffer as long as possible, and {W} granted the wish.',
  'Fifty minutes to lose a game {L} had already lost at the auction. {W} wins, by exhaustion.',
];
export const STELLA = [
  '{p} scores {n} for {W}, who for once bought someone who can play.',
  '{n} points from {p}: {W} spent the credits well, and the world is still in shock.',
  '{p} scores {n} and {W} takes the credit. As if he had coached him.',
  '{p} punches in {n} for {W}. The defense guarded him the way you guard a friend at the bar: from afar.',
  '{n} points from {p}. {W} watches him score the way you watch an investment that worked by accident.',
];
export const STELLA_PERDE = [
  '{p} scores {n} and {L} loses anyway: the one good buy of the auction, surrounded by four mistakes.',
  '{n} points from {p}. {L} built around him a team that didn\'t deserve to watch him.',
  '{p} scores {n}. {L}\'s other four were there for the photos.',
  '{p} scores {n} and asks for a trade after the game. Far from {L}, preferably.',
  'One man and four extras: {p} scores {n}, {L} loses and blames the referees.',
];
export const PERDE_PIATTO = [
  '{L} never found a good possession, because he didn\'t buy one at the auction.',
  '{L} was missing everything, starting with a general manager.',
  '{L} played the way he ran the auction: badly, but with conviction.',
  'What remains of {L} is the silence on the bench and the laughter in the stands.',
  '{L} was on the floor. Unfortunately.',
  '{L}\'s game should be studied in general manager courses, under "what not to do".',
  'Someone tell {L} that a lineup is picked with your head, not by rolling dice.',
];
export const ASSIST = [
  '{p} hands out {n} assists to teammates who didn\'t deserve them. One was picked by {L}... no wait, he\'s {W}\'s. It shows anyway.',
  '{n} assists from {p}: passes {L} wouldn\'t see even in slow motion.',
  '{p} sets the table {n} times. The others eat, {L} watches.',
];
export const RIMBALZI = [
  '{p} grabs {n} rebounds. {L} grabbed fewer in the whole auction, of the right decisions.',
  '{n} rebounds from {p}: he put a "private property" sign under the basket.',
  '{p} cleans the glass: {n} rebounds. {L}\'s guys watched the ball go up, paying customers.',
];
export const VIOLINO = [
  '{L} gave the ball to {v} as first option. His best player was {p}: details a general manager notices. Not {L}.',
  '{L}\'s first option: {v}. {L}\'s best player: {p}. Two lines that explain the loss better than an hour of analysis.',
];
export const SCELTA = [
  '{L} had picked "{s}". Brave. Wrong, but brave.',
  '{L}\'s plan was "{s}". The plan lasted until the tip-off.',
  '"{s}", said {L}\'s whiteboard. The players didn\'t read it, and it was their best moment.',
];
export const PERSONA = {
  'Allen Iverson': {
    vince: [
      '{p} scores {n} for {W}, then asks if there\'s practice tomorrow. Practice? We\'re talking about practice?',
      '{n} points from {p} for {W}, almost all on his own: passing is for tall people.',
    ],
    perde: [
      '{p} scores {n} and {L} loses anyway. He\'s skipping tomorrow\'s practice either way.',
    ],
  },
  'Michael Jordan': {
    vince: [
      '{p} scores {n} for {W} and takes it personally anyway, even though he won.',
      '{n} points from {p} for {W}. Someone trash-talked him in warm-ups: don\'t trash-talk {p}.',
    ],
    perde: [
      '{p} scores {n} and loses. He looked at the teammates {L} picked like a man taking it personally. {L}, brace yourself.',
    ],
  },
  'Kobe Bryant': {
    vince: [
      '{p} takes shots as if they were free: {n} points for {W}, and one pass by mistake.',
    ],
    perde: [
      '{p} scores {n} with more shots than teammates. {L} applauds anyway, knowing as much about basketball as about auctions.',
    ],
  },
  'Shaquille O\'Neal': {
    vince: [
      '{p} scores {n} for {W} without ever leaving the paint. At the free-throw line, though, the arena covers its eyes.',
    ],
    perde: [
      '{p} scores {n} and {L} loses: at the line he decided to do charity.',
    ],
  },
  'James Harden': {
    vince: [
      '{p} scores {n} for {W}, half from the line: nobody really touched him, but the referee saw his face and took pity.',
    ],
    perde: [
      '{p} scores {n} and {L} loses anyway. He asked for a foul on the final buzzer too.',
    ],
  },
  'Carmelo Anthony': {
    vince: [
      '{p} scores {n} for {W} and defends zero: at least he\'s consistent.',
    ],
    perde: [
      '{p} scores {n} and leaves the defense at home. {L} spent the credits to watch him guard the air.',
    ],
  },
  'Russell Westbrook': {
    vince: [
      '{p} finishes with {n} for {W} and the usual urge to do everything himself, wrong things included.',
    ],
    perde: [
      '{p} scores {n}: gorgeous stats for a losing team. Like {L}\'s résumé.',
    ],
  },
  'Stephen Curry': {
    vince: [
      '{p} scores {n} for {W} and turns around before the ball goes in. Rude, but effective.',
    ],
    perde: [
      '{p} scores {n} and loses: even he isn\'t enough alone, especially with teammates picked by {L}.',
    ],
  },
  'LeBron James': {
    vince: [
      '{p} scores {n} for {W} and doubles as general manager, since {W} could use one.',
    ],
    perde: [
      '{p} scores {n} and loses. He\'ll ask for a trade by summer. Far from {L}.',
    ],
  },
  'Kevin Durant': {
    vince: [
      '{p} scores {n} for {W} without looking up, then opens a fake account to compliment himself.',
    ],
    perde: [
      '{p} scores {n} and loses. Tonight he opens a fake account to defend {L}. He\'ll be the only one.',
    ],
  },
  'Kawhi Leonard': {
    vince: [
      '{p} scores {n} for {W} without changing expression. Nobody knows if he\'s happy. Not even him.',
    ],
    perde: [
      '{p} scores {n}, then sits out the next two as a precaution. {L} understands: he\'d rest himself too.',
    ],
  },
  'Giannis Antetokounmpo': {
    vince: [
      '{p} scores {n} for {W}, reaching the rim in two steps from half court.',
    ],
    perde: [
      '{p} scores {n} and loses: he takes so long at the line that {L} has time to botch another auction.',
    ],
  },
  'Kareem Abdul-Jabbar': {
    vince: [
      '{p} scores {n} for {W} with the skyhook: nobody has blocked it in fifty years.',
    ],
    perde: [
      '{p} scores {n} with the skyhook and {L} loses: the hook was pretty, the rest of the team wasn\'t.',
    ],
  },
  'Hakeem Olajuwon': {
    vince: [
      '{p} scores {n} for {W} with the Dream Shake: his defender is still spinning.',
    ],
    perde: [
      '{p} scores {n} and loses: his teammates did the Dream Shake on defense too, spinning at nothing.',
    ],
  },
  'Dirk Nowitzki': {
    vince: [
      '{p} scores {n} for {W} on one leg. He uses the other to mock whoever guards him.',
    ],
    perde: [
      '{p} scores {n} on one leg. {L} loses on both.',
    ],
  },
  'Larry Bird': {
    vince: [
      '{p} scores {n} for {W}, and before tip-off he had already told the defense where he\'d shoot from.',
    ],
    perde: [
      '{p} scores {n} and loses, and now has to explain to everyone why he agreed to play for {L}.',
    ],
  },
  'Magic Johnson': {
    vince: [
      '{p} scores {n} for {W} with a smile, the most humiliating way to beat someone.',
    ],
    perde: [
      '{p} scores {n} and smiles anyway. {L}, a bit less.',
    ],
  },
  'Joel Embiid': {
    vince: [
      '{p} scores {n} for {W} and is questionable for the next one. As always.',
    ],
    perde: [
      '{p} scores {n} and loses. Questionable tomorrow, as always, and {L} no longer knows whether to hope.',
    ],
  },
  'Nikola Jokic': {
    vince: [
      '{p} scores {n} for {W} looking like he\'d rather be at the horse races already.',
    ],
    perde: [
      '{p} scores {n} and loses. He doesn\'t care: there are horses tonight.',
    ],
  },
};

// Game 7 easter egg: Fabio has nothing to do with the game, which is exactly
// why it's funny. Same condition as the Italian: game 7 only.
export const FABIO = [
  'Apropos of nothing: Fabio is an embarrassing GM.',
  'Anyway, Fabio is drunk.',
  'Worth noting that Fabio, without even playing, is losing anyway.',
  'Game 7. Fabio would have lost in game 4.',
  'Fabio wouldn\'t understand a game like this even if you explained it to him twice.',
  'Side note: Fabio botched the auction. Yes, this time too.',
  'Then again, someone as good as Fabio never makes it to game 7.',
  'A real game 7. Fabio is watching from home, and even from there he\'s making questionable choices.',
  'Meanwhile Fabio is still trying to figure out what a second option is.',
  'Seven games. Fabio would have needed three to do some damage.',
  'Fabio isn\'t in this game. It\'s the only thing he\'s done right so far.',
  'PS: Fabio is still a terrible general manager. Just a reminder.',
];

// "Why X won": the line before a factor that went AGAINST the winner, and the
// lines for when no tactical reason stands out.
export const CONTRO = ['And won anyway:', 'Despite all that:', 'The funny thing is it wasn\'t enough:'];
export const NESSUN_MOTIVO = (W) => [
  `${W} is better everywhere. No tactical explanation needed, redo the auction.`,
  `Nothing to analyze: ${W} bought the good players, the others bought the rest.`,
  `${W} won because it's stronger. That's it. No genius move, no excuses.`,
];

// The verdict above the tactical report: one line, half a second to read.
export function verdettoReferto(ref, haVinto, pt) {
  const contate = ref.voci.filter((v) => !v.ininfluente);
  const giuste = contate.filter((v) => v.eraGiusta).length;
  const tot = contate.length;
  const guadagno = ref.voci.reduce((s, v) => s + v.valore, 0);
  const peggiore = ref.voci.slice().sort((a, b) => b.quantoMeglio - a.quantoMeglio)[0];
  if (tot === 0) return 'Against this team any choice was as good as another. You could have skipped the bench altogether.';
  if (giuste === tot) {
    return haVinto
      ? `${tot} out of ${tot} choices right, ${pt(guadagno)} points per game. For once, congratulations.`
      : `Every choice was right (${pt(guadagno)} per game) and you lost anyway. The problem is the roster, not the bench.`;
  }
  if (guadagno <= -2.5) {
    return `${pt(guadagno)} points per game: a coin would have done better. `
      + `The disaster is the ${peggiore.etichetta.toLowerCase()}, where ${peggiore.migliore} was worth ${pt(peggiore.quantoMeglio)}.`;
  }
  if (peggiore.quantoMeglio >= 1.5) {
    return `${pt(guadagno)} per game, but you really got the ${peggiore.etichetta.toLowerCase()} wrong: `
      + `with ${peggiore.migliore} it was ${pt(peggiore.quantoMeglio)} more points. Every single game.`;
  }
  if (guadagno >= 2.5) return `You actually coached: ${giuste} of ${tot} choices were the best ones, ${pt(guadagno)} points per game compared to random picks.`;
  if (guadagno >= 1) return `${pt(guadagno)} points per game. Nothing memorable, but at least you didn't hurt yourself.`;
  if (guadagno <= -1) return `${pt(guadagno)} points per game compared to random picks. You coached against yourself.`;
  return `${pt(guadagno)} points per game: the bench made no difference, either way.`;
}

// The one-line team profile.
export const IDENTITA = {
  spacing: 'full spacing', murato: 'walled-in floor', pesante: 'heavy lineup', small: 'small ball',
  blindato: 'locked-down rim', aperta: 'open door in the paint', perimetro: 'elite perimeter defense',
  regia: 'top-level playmaking', nessuno: 'nobody who can pass', stelle: 'too many stars and one ball',
  anonimo: 'balanced profile, meaning anonymous',
};
