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
  'Did {L} run the auction sober? The evidence says no.',
  'A massacre. {L} will say he was just trying out a lineup. He says that every time.',
  '{W} wins, {L} asks to swap teams midway through the third quarter. Denied.',
  'Over by the first timeout. {L} stayed on the floor only because of the contract.',
  'Someone take the team away from {L}: he is a danger to himself and others.',
  'That\'s not a loss, that\'s a lawsuit. Against {L}, for that auction.',
  '{W} played basketball. {L} participated.',
  'After the game {L} asked not to be quoted. Too late.',
  'Over in warm-ups. The rest was cruelty against {L}, and he earned it.',
];
export const OPEN_CONTROL = [
  '{W} manages the game with all the care {L} didn\'t put into the auction.',
  'Never in doubt. {L} believed for four minutes, then gave up with dignity. Without dignity, actually.',
  '{W} in control from the start. {L} in control of nothing, as usual.',
  'Easy win for {W}. {L} says "the team is there". It isn\'t.',
  '{W} takes it home without breaking a sweat. {L} is sweating, from embarrassment.',
  'Never a game: {L} picked the wrong key back at the auction.',
];
export const OPEN_CLOSE = [
  'Balanced for three quarters, then {L} remembered being {L}.',
  '{L} really believed. That\'s the touching part.',
  'Hard-fought, until {W} decided to stop playing with its food.',
  'For a moment {L} looked like a general manager. It passed.',
  'A real game until the fourth quarter, when {L}\'s roster showed what it is.',
];
export const OPEN_THRILLER = [
  'Decided on the last possession. Tonight {L} rewatches the game and the roster, and cries over both.',
  'Two points. Two. {L} will be looking for them in drawers for years.',
  'A heart-stopping finish: {W} gets the thrill, {L} gets the actual heart attack.',
  'It comes down to one possession, and {L} as always hands it to the wrong guy.',
  '{W} wins by a whisker. {L} loses by a whisker, which almost sounds like a compliment. It isn\'t.',
  'Beautiful, for anyone not rooting for {L}.',
];
export const OPEN_OT = [
  'Overtime: {L} couldn\'t manage to lose it in regulation and asked for five more minutes.',
  'Forty minutes aren\'t enough for {L} to figure out how to close a game. Neither are forty-five, it turns out.',
  'Overtime. {W} and {L} both tried their best to lose it, {L} with more talent.',
  'An overtime gifted by {L}\'s bench, which really can\'t sit still.',
];
export const OPEN_2OT = [
  'Double overtime. {L} wanted to suffer as long as possible, and got his wish.',
  'Fifty minutes to lose a game {L} had already lost at the auction.',
  'Two overtimes: at some point {L} stopped coaching and started praying. It didn\'t work.',
];
export const LOSER_WITH_STAR = [
  '{p} scores {n} and {L} loses anyway: the one good buy of the auction, surrounded by four mistakes.',
  '{n} points from {p}. {L} built around him a team that didn\'t deserve to watch him.',
  '{p} scores {n}. {L}\'s other four were there for the photos.',
  '{p} scores {n} and asks for a trade after the game. Far from {L}, preferably.',
  '{n} points from {p} wasted by {L}, who has a rare talent: ruining other people\'s.',
  'One man and four extras: {p} scores {n}, {L} loses and blames the referees.',
  '{p} punches in {n} points. {L} punches the clock and goes back to botching auctions.',
];
export const LOSER_FLAT = [
  '{L} never found a good possession, because he didn\'t buy one at the auction.',
  '{L} was missing everything, starting with a general manager.',
  '{L} played the way he ran the auction: badly, but with conviction.',
  'What remains of {L} is the silence on the bench and the laughter in the stands.',
  '{L} was on the floor. Unfortunately.',
  '{L} did the game a favor: someone had to lose it, and he volunteered.',
  '{L}\'s game should be studied in general manager courses, under "what not to do".',
  '{L} loses and already has the excuse ready. Same as last game.',
  'Someone tell {L} that a lineup is picked with your head, not by rolling dice.',
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
