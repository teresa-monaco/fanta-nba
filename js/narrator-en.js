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
  'ho-tiro': [
    'The handoffs free {T}\'s shooters on the move, and that\'s where the opposing defense stops existing.',
  ],
  'ho-lettura': [
    '{T}\'s bigs read the handoffs well. It doesn\'t happen often, let\'s enjoy it.',
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
  'Shameful.',
  'Call it a game, if it helps you sleep at night.',
  'Over during warm-ups. The rest was cruelty.',
  'Only one team showed up. The other one bought a ticket.',
  'They stopped counting in the third quarter. Out of pity, not fatigue.',
  'That\'s not a loss, that\'s a medical report.',
  'Five against nobody, and the nobodies even had jerseys.',
  'A sporting scandal. As in, someone should investigate.',
  'If there was a bet on the margin, whoever said "a lot" won.',
];
export const OPEN_CONTROL = [
  'Never in doubt. Never even interesting.',
  'Managed with the boredom of someone who knew how it ended, and was right.',
  'A control so calm it was almost offensive.',
  'Lead taken, lead managed, opponent ignored.',
  'The classic +12 that looks like +4 and was really +20 in disguise.',
  'A one-sided game with the good manners not to say it too loud.',
];
export const OPEN_CLOSE = [
  'Balanced, until someone remembered how to play basketball.',
  'It looked like a real game, then the ending put everyone back in their place.',
  'Neck and neck for three quarters. Then came the fourth quarter, and the truth.',
  'Hard-fought, tight, and in the end won by the team with the better players. What a surprise.',
  'For thirty minutes it was a game. Then it went back to being what it was.',
];
export const OPEN_THRILLER = [
  'Decided on the last possession. Someone isn\'t sleeping tonight.',
  'An ending so good you almost feel sorry for the loser. Almost.',
  'It could have ended two ways. It ended the worst way, for one of them.',
  'A two-point margin and a lifetime of regret, free of charge.',
  'It comes down to one possession, and the same guy always blows it.',
  'One of those you watch again. Or delete, depending on how it went.',
];
export const OPEN_OT = [
  'Overtime, because neither of them could close it out.',
  'Forty minutes weren\'t enough to decide who was less bad.',
  'Overtime: both did everything to lose it earlier, and failed.',
  'An overtime gifted by the inability to win in regulation.',
];
export const OPEN_2OT = [
  'Double overtime. At some point it becomes mutual cruelty.',
  'Two overtimes: neither wanted to win, one had to give in to the evidence.',
  'Fifty minutes to learn something everyone knew from the start.',
];

export const LOSER_WITH_STAR = [
  '{n} points from {p} aren\'t enough for {L}. The other four were there for the buffet.',
  '{p} scores {n} and {L} loses anyway. Congratulations to whoever built that roster.',
  '{n} points from {p} thrown in the bin along with the rest of {L}.',
  '{p} does his part with {n} points. The rest of {L} did theirs: nothing.',
  '{n} from {p}. {L} needed a second man and bought four fake ones.',
  '{p} with {n} points, and {L} loses: that\'s called wasting a fortune.',
  'One man in charge and four tourists: {p} scores {n}, {L} loses.',
];
export const LOSER_FLAT = [
  '{L} never found a good possession. Because there isn\'t one on the roster.',
  '{L} tried everything. Everything, in this case, was very little.',
  'What people will remember about {L} is the embarrassed silence on the bench.',
  '{L} was never in the game, and by the middle of the third quarter stopped pretending.',
  '{L} was missing everything. Starting with the players.',
  '{L} played as if the result had already been decided. It had.',
  '{L} was on the floor, but nobody noticed.',
  '{L}\'s performance should be studied, if there were anything to study.',
  '{L} did the game a favor: somebody had to lose.',
];

export const PUNTI = [
  '{p} drops {n} for {T}',
  '{n} points from {p} for {T}',
  '{p} finishes with {n} for {T}',
  '{T} hangs on to {p}\'s {n} points',
  '{T} gets through on {p}\'s {n} points',
  '{p} punches in {n} points and {T} says thanks',
];
export const ASSIST = [
  '{p} hands out {n} assists',
  '{p} serves {n} assists to people who didn\'t deserve them',
  '{n} assists from {p}, with the ball moving the way it should',
  '{p} sets the table {n} times',
  '{n} assists from {p}, who sees things nobody else sees',
];
export const RIMBALZI = [
  '{p} grabs {n} rebounds',
  '{p} pulls down {n} rebounds unopposed',
  '{n} rebounds from {p}, basically on his own',
  '{p} cleans the glass: {n} rebounds',
  '{n} rebounds from {p}, who decides everything under the basket',
];

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
