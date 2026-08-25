/*
 * Steak Frites — league defaults (draft order + keepers).
 * The setup screen pre-fills from this; you can still edit anything before starting.
 *
 *   teams    : draft slots 1..10, in order
 *   userTeam : which slot is "you" (name must match a team above)
 *   keepers  : { name, teamIdx (0-based), round }  — the keeper uses that team's
 *              pick in that round. If two keepers collide on a round, the engine
 *              bumps the second to the nearest free round for that team.
 *
 * Keeper `name` must match a player in data/players.js exactly.
 */
window.LEAGUE_CONFIG = {
  teams: ["Schiff", "Coop", "Katz", "Adam", "Jules", "Ben W", "Stefan", "fishtoots", "Vader", "Ben Goldstein"],
  userTeam: "Ben W",
  keepers: [
    // Schiff
    { name: "Tyler Warren", teamIdx: 0, round: 11 },
    { name: "Chris Olave", teamIdx: 0, round: 7 },
    // Coop  (two at 16 — the second bumps to the nearest free round)
    { name: "Luther Burden III", teamIdx: 1, round: 16 },
    { name: "Harold Fannin Jr.", teamIdx: 1, round: 16},
    // Katz
    { name: "Tetairoa McMillan", teamIdx: 2, round: 5 },
    { name: "Javonte Williams", teamIdx: 2, round: 9 },
    // Adam
    { name: "DeVonta Smith", teamIdx: 3, round: 6 },
    { name: "Kyle Pitts Sr.", teamIdx: 3, round: 15 },
    // Jules
    { name: "Kyle Monangai", teamIdx: 4, round: 16 },
    { name: "David Montgomery", teamIdx: 4, round: 7 },
    // Ben W  (you)
    { name: "Bhayshul Tuten", teamIdx: 5, round: 15 },
    { name: "Drake Maye", teamIdx: 5, round: 16 },
    // Stefan
    { name: "Cam Skattebo", teamIdx: 6, round: 11 },
    { name: "Breece Hall", teamIdx: 6, round: 5},
    // fishtoots
    { name: "Travis Etienne Jr.", teamIdx: 7, round: 9 },
    { name: "Trevor Lawrence", teamIdx: 7, round: 16 },
    // Vader
    { name: "Emeka Egbuka", teamIdx: 8, round: 8 },
    { name: "Colston Loveland", teamIdx: 8, round: 14 },
    // Ben Goldstein
    { name: "George Pickens", teamIdx: 9, round: 6 },
    { name: "Quinshon Judkins", teamIdx: 9, round: 10 },
  ],
};
