// Mock data matching docs/API.md exactly. Player names, rosters and week-2
// half-PPR projections come from tests/fixtures/sleeper/* ("The Megalabowl").
import type {
  Action,
  ActionFeed,
  TradeFinderResponse,
  WaiverPlanResponse,
  Confidence,
  Depth,
  Feature,
  Grade,
  Grades,
  LeagueSummary,
  Lineup,
  LineupChange,
  LineupSlot,
  Me,
  Player,
  PositionGrade,
  Product,
  Report,
  SleeperLeagueRef,
  TeamSummary,
  Tendencies,
  TradeRequest,
  TradeResult,
  Verdict,
  Waivers,
} from "./types";

export const LEAGUE_ID = "1403186749361901568";
export const MY_TEAM_ID = "8";
export const WEEK = 2;

export const PRODUCTS: Product[] = [
  { sku: "free", name: "Free", price_cents: 0, features: ["my_team"], leagues: 1, blurb: "Start/sit for one team." },
  { sku: "waivers", name: "Wire Pass", price_cents: 300, features: ["waivers"], leagues: 1, blurb: "The wire, ranked. Bid and drop included." },
  { sku: "trade_lab", name: "Trade Lab", price_cents: 500, features: ["trade_lab"], leagues: 1, blurb: "Verdicts and counters, rest of season." },
  { sku: "full_report", name: "Full Booth", price_cents: 700, features: ["my_team", "waivers", "trade_lab", "full_report"], leagues: 5, blurb: "The whole booth. Five leagues." },
];

export const SLEEPER_LEAGUES: SleeperLeagueRef[] = [
  { league_id: LEAGUE_ID, name: "The Megalabowl", status: "in_season", total_rosters: 12 },
  { league_id: "1403186749361901569", name: "Backyard Brawl", status: "in_season", total_rosters: 10 },
];

export interface MockRoster {
  id: string;
  name: string;
  owner_name: string;
  record: string;
  points_for: number;
  starters: Player[];
  bench: Player[];
}

export const ROSTERS: MockRoster[] = [
  { id: "1", name: "Gaainzzz", owner_name: "joneil26", record: "2-0", points_for: 127.78,
    starters: [
      {"id":"6804","name":"Jordan Love","position":"QB","nfl_team":"GB","injury_status":null,"projected":19.6,"opponent":"NYJ"},
      {"id":"4866","name":"Saquon Barkley","position":"RB","nfl_team":"PHI","injury_status":null,"projected":15.4,"opponent":"TEN"},
      {"id":"5892","name":"David Montgomery","position":"RB","nfl_team":"HOU","injury_status":null,"projected":15.8,"opponent":"CIN"},
      {"id":"6786","name":"CeeDee Lamb","position":"WR","nfl_team":"DAL","injury_status":null,"projected":15.5,"opponent":"WAS"},
      {"id":"7525","name":"DeVonta Smith","position":"WR","nfl_team":"PHI","injury_status":null,"projected":12.3,"opponent":"TEN"},
      {"id":"5022","name":"Dallas Goedert","position":"TE","nfl_team":"PHI","injury_status":null,"projected":8.1,"opponent":"TEN"},
      {"id":"8228","name":"Jaylen Warren","position":"RB","nfl_team":"PIT","injury_status":null,"projected":10.6,"opponent":"NE"},
      {"id":"5927","name":"Terry McLaurin","position":"WR","nfl_team":"WAS","injury_status":null,"projected":12,"opponent":"DAL"},
      {"id":"PHI","name":"PHI D/ST","position":"DEF","nfl_team":"PHI","injury_status":null,"projected":9.6,"opponent":"TEN"},
    ],
    bench: [
      {"id":"11631","name":"Brian Thomas","position":"WR","nfl_team":"JAX","injury_status":"Questionable","projected":6.9,"opponent":"DEN"},
      {"id":"12545","name":"Tyler Shough","position":"QB","nfl_team":"NO","injury_status":null,"projected":15.3,"opponent":"BAL"},
      {"id":"4199","name":"Aaron Jones","position":"RB","nfl_team":"MIN","injury_status":null,"projected":10.5,"opponent":"CHI"},
      {"id":"5872","name":"Deebo Samuel","position":"WR","nfl_team":"SF","injury_status":null,"projected":9.2,"opponent":"MIA"},
      {"id":"7553","name":"Kyle Pitts","position":"TE","nfl_team":"ATL","injury_status":null,"projected":7.8,"opponent":"CAR"},
    ],
  },
  { id: "2", name: "The Dart Knight Chases", owner_name: "TripzPrime", record: "0-2", points_for: 101.4,
    starters: [
      {"id":"12508","name":"Jaxson Dart","position":"QB","nfl_team":"NYG","injury_status":null,"projected":18.1,"opponent":"LAR"},
      {"id":"12534","name":"Kyle Monangai","position":"RB","nfl_team":"CHI","injury_status":null,"projected":6.3,"opponent":"MIN"},
      {"id":"7564","name":"Ja'Marr Chase","position":"WR","nfl_team":"CIN","injury_status":null,"projected":13.8,"opponent":"HOU"},
      {"id":"8112","name":"Drake London","position":"WR","nfl_team":"ATL","injury_status":null,"projected":11.7,"opponent":"CAR"},
      {"id":"10236","name":"Dalton Kincaid","position":"TE","nfl_team":"BUF","injury_status":null,"projected":9.8,"opponent":"DET"},
      {"id":"8146","name":"Garrett Wilson","position":"WR","nfl_team":"NYJ","injury_status":null,"projected":12.2,"opponent":"GB"},
      {"id":"12514","name":"Emeka Egbuka","position":"WR","nfl_team":"TB","injury_status":null,"projected":9.2,"opponent":"CLE"},
      {"id":"LAC","name":"LAC D/ST","position":"DEF","nfl_team":"LAC","injury_status":null,"projected":8.5,"opponent":"LV"},
    ],
    bench: [
      {"id":"11566","name":"Jayden Daniels","position":"QB","nfl_team":"WAS","injury_status":null,"projected":20.5,"opponent":"DAL"},
      {"id":"11604","name":"Brock Bowers","position":"TE","nfl_team":"LV","injury_status":"Out","projected":10.6,"opponent":"LAC"},
      {"id":"12469","name":"Dylan Sampson","position":"RB","nfl_team":"CLE","injury_status":"IR","projected":0,"opponent":"—"},
      {"id":"5850","name":"Josh Jacobs","position":"RB","nfl_team":"GB","injury_status":"NA","projected":0,"opponent":"—"},
      {"id":"5947","name":"Jakobi Meyers","position":"WR","nfl_team":"JAX","injury_status":null,"projected":7.5,"opponent":"DEN"},
      {"id":"9482","name":"Michael Mayer","position":"TE","nfl_team":"LV","injury_status":null,"projected":2.7,"opponent":"LAC"},
      {"id":"9754","name":"Quentin Johnston","position":"WR","nfl_team":"LAC","injury_status":null,"projected":8.3,"opponent":"LV"},
    ],
  },
  { id: "3", name: "Eppsy13", owner_name: "Eppsy13", record: "0-2", points_for: 110.6,
    starters: [
      {"id":"4881","name":"Lamar Jackson","position":"QB","nfl_team":"BAL","injury_status":null,"projected":20.6,"opponent":"NO"},
      {"id":"6813","name":"Jonathan Taylor","position":"RB","nfl_team":"IND","injury_status":null,"projected":17.4,"opponent":"KC"},
      {"id":"13287","name":"Jeremiyah Love","position":"RB","nfl_team":"ARI","injury_status":null,"projected":10.7,"opponent":"SEA"},
      {"id":"7569","name":"Nico Collins","position":"WR","nfl_team":"HOU","injury_status":null,"projected":15,"opponent":"CIN"},
      {"id":"2133","name":"Davante Adams","position":"WR","nfl_team":"LAR","injury_status":null,"projected":10.2,"opponent":"NYG"},
      {"id":"12506","name":"Harold Fannin","position":"TE","nfl_team":"CLE","injury_status":null,"projected":8.1,"opponent":"TB"},
      {"id":"13279","name":"Carnell Tate","position":"WR","nfl_team":"TEN","injury_status":null,"projected":6.9,"opponent":"PHI"},
      {"id":"6819","name":"Michael Pittman","position":"WR","nfl_team":"PIT","injury_status":null,"projected":9.3,"opponent":"NE"},
      {"id":"LAR","name":"LAR D/ST","position":"DEF","nfl_team":"LAR","injury_status":null,"projected":8.8,"opponent":"NYG"},
    ],
    bench: [
      {"id":"12048","name":"George Holani","position":"RB","nfl_team":"SEA","injury_status":null,"projected":7.2,"opponent":"ARI"},
      {"id":"13281","name":"Jordyn Tyson","position":"WR","nfl_team":"NO","injury_status":"IR","projected":0,"opponent":"—"},
      {"id":"13293","name":"Ja'Kobi Lane","position":"WR","nfl_team":"BAL","injury_status":"Out","projected":0,"opponent":"—"},
      {"id":"1466","name":"Travis Kelce","position":"TE","nfl_team":"KC","injury_status":null,"projected":8.6,"opponent":"IND"},
      {"id":"5012","name":"Mark Andrews","position":"TE","nfl_team":"BAL","injury_status":null,"projected":8.3,"opponent":"NO"},
      {"id":"9508","name":"Tyjae Spears","position":"RB","nfl_team":"TEN","injury_status":null,"projected":6.4,"opponent":"PHI"},
    ],
  },
  { id: "4", name: "FxxxKroenke", owner_name: "FxxxKroenke", record: "0-2", points_for: 91.86,
    starters: [
      {"id":"4046","name":"Patrick Mahomes","position":"QB","nfl_team":"KC","injury_status":null,"projected":17.9,"opponent":"IND"},
      {"id":"9509","name":"Bijan Robinson","position":"RB","nfl_team":"ATL","injury_status":null,"projected":20.1,"opponent":"CAR"},
      {"id":"8150","name":"Kyren Williams","position":"RB","nfl_team":"LAR","injury_status":null,"projected":16,"opponent":"NYG"},
      {"id":"8137","name":"George Pickens","position":"WR","nfl_team":"DAL","injury_status":null,"projected":13.8,"opponent":"WAS"},
      {"id":"6801","name":"Tee Higgins","position":"WR","nfl_team":"CIN","injury_status":null,"projected":11.8,"opponent":"HOU"},
      {"id":"10859","name":"Sam LaPorta","position":"TE","nfl_team":"DET","injury_status":null,"projected":9,"opponent":"BUF"},
      {"id":"7526","name":"Jaylen Waddle","position":"WR","nfl_team":"DEN","injury_status":null,"projected":10.4,"opponent":"JAX"},
      {"id":"11628","name":"Marvin Harrison","position":"WR","nfl_team":"ARI","injury_status":null,"projected":7.9,"opponent":"SEA"},
      {"id":"HOU","name":"HOU D/ST","position":"DEF","nfl_team":"HOU","injury_status":null,"projected":7,"opponent":"CIN"},
    ],
    bench: [
      {"id":"10232","name":"Michael Wilson","position":"WR","nfl_team":"ARI","injury_status":null,"projected":8.3,"opponent":"SEA"},
      {"id":"13414","name":"Kaelon Black","position":"RB","nfl_team":"SF","injury_status":null,"projected":6.4,"opponent":"MIA"},
      {"id":"3214","name":"Hunter Henry","position":"TE","nfl_team":"NE","injury_status":null,"projected":8.3,"opponent":"PIT"},
      {"id":"7523","name":"Trevor Lawrence","position":"QB","nfl_team":"JAX","injury_status":null,"projected":17.2,"opponent":"DEN"},
      {"id":"9756","name":"Jordan Addison","position":"WR","nfl_team":"MIN","injury_status":null,"projected":9.4,"opponent":"CHI"},
    ],
  },
  { id: "5", name: "GoldenPP", owner_name: "GoldenPP", record: "0-2", points_for: 116.3,
    starters: [
      {"id":"421","name":"Matthew Stafford","position":"QB","nfl_team":"LAR","injury_status":null,"projected":16.8,"opponent":"NYG"},
      {"id":"12507","name":"Omarion Hampton","position":"RB","nfl_team":"LAC","injury_status":null,"projected":12.1,"opponent":"LV"},
      {"id":"12481","name":"Cam Skattebo","position":"RB","nfl_team":"NYG","injury_status":null,"projected":12.2,"opponent":"LAR"},
      {"id":"9488","name":"Jaxon Smith-Njigba","position":"WR","nfl_team":"SEA","injury_status":null,"projected":16.2,"opponent":"ARI"},
      {"id":"11632","name":"Malik Nabers","position":"WR","nfl_team":"NYG","injury_status":null,"projected":11.3,"opponent":"LAR"},
      {"id":"7002","name":"Juwan Johnson","position":"TE","nfl_team":"NO","injury_status":null,"projected":7.7,"opponent":"BAL"},
      {"id":"4983","name":"DJ Moore","position":"WR","nfl_team":"BUF","injury_status":null,"projected":10.9,"opponent":"DET"},
      {"id":"11620","name":"Rome Odunze","position":"WR","nfl_team":"CHI","injury_status":null,"projected":8.2,"opponent":"MIN"},
      {"id":"SEA","name":"SEA D/ST","position":"DEF","nfl_team":"SEA","injury_status":null,"projected":8.9,"opponent":"ARI"},
    ],
    bench: [
      {"id":"12489","name":"RJ Harvey","position":"RB","nfl_team":"DEN","injury_status":null,"projected":8,"opponent":"JAX"},
      {"id":"13294","name":"Makai Lemon","position":"WR","nfl_team":"PHI","injury_status":null,"projected":5.2,"opponent":"TEN"},
      {"id":"5967","name":"Tony Pollard","position":"RB","nfl_team":"TEN","injury_status":null,"projected":8,"opponent":"PHI"},
      {"id":"8110","name":"Jake Ferguson","position":"TE","nfl_team":"DAL","injury_status":null,"projected":8,"opponent":"WAS"},
      {"id":"8161","name":"Malik Willis","position":"QB","nfl_team":"MIA","injury_status":null,"projected":17.9,"opponent":"SF"},
    ],
  },
  { id: "6", name: "Prestige Worldwide", owner_name: "NoCoRob", record: "1-1", points_for: 142.7,
    starters: [
      {"id":"3294","name":"Dak Prescott","position":"QB","nfl_team":"DAL","injury_status":null,"projected":20.3,"opponent":"WAS"},
      {"id":"9224","name":"Chase Brown","position":"RB","nfl_team":"CIN","injury_status":null,"projected":13.6,"opponent":"HOU"},
      {"id":"8151","name":"Kenneth Walker","position":"RB","nfl_team":"KC","injury_status":null,"projected":14.7,"opponent":"IND"},
      {"id":"12519","name":"Luther Burden","position":"WR","nfl_team":"CHI","injury_status":null,"projected":9.5,"opponent":"MIN"},
      {"id":"10229","name":"Rashee Rice","position":"WR","nfl_team":"KC","injury_status":null,"projected":10.9,"opponent":"IND"},
      {"id":"12518","name":"Tyler Warren","position":"TE","nfl_team":"IND","injury_status":null,"projected":9.1,"opponent":"KC"},
      {"id":"7567","name":"Kenny Gainwell","position":"RB","nfl_team":"TB","injury_status":null,"projected":7,"opponent":"CLE"},
      {"id":"12533","name":"Jacory Croskey-Merritt","position":"RB","nfl_team":"WAS","injury_status":null,"projected":11.6,"opponent":"DAL"},
      {"id":"KC","name":"KC D/ST","position":"DEF","nfl_team":"KC","injury_status":null,"projected":8.8,"opponent":"IND"},
    ],
    bench: [
      {"id":"13305","name":"Mike Washington","position":"RB","nfl_team":"LV","injury_status":null,"projected":3.3,"opponent":"LAC"},
      {"id":"13345","name":"Jonah Coleman","position":"RB","nfl_team":"DEN","injury_status":null,"projected":1.8,"opponent":"JAX"},
      {"id":"4892","name":"Baker Mayfield","position":"QB","nfl_team":"TB","injury_status":null,"projected":17.3,"opponent":"CLE"},
      {"id":"8121","name":"Romeo Doubs","position":"WR","nfl_team":"NE","injury_status":null,"projected":7.4,"opponent":"PIT"},
      {"id":"9997","name":"Zay Flowers","position":"WR","nfl_team":"BAL","injury_status":"Out","projected":11.8,"opponent":"NO"},
    ],
  },
  { id: "7", name: "Noflyzone444", owner_name: "Noflyzone444", record: "0-2", points_for: 96.36,
    starters: [
      {"id":"6797","name":"Justin Herbert","position":"QB","nfl_team":"LAC","injury_status":null,"projected":17.1,"opponent":"LV"},
      {"id":"8138","name":"James Cook","position":"RB","nfl_team":"BUF","injury_status":null,"projected":15.8,"opponent":"DET"},
      {"id":"7611","name":"Rhamondre Stevenson","position":"RB","nfl_team":"NE","injury_status":null,"projected":10.9,"opponent":"PIT"},
      {"id":"4037","name":"Chris Godwin","position":"WR","nfl_team":"TB","injury_status":null,"projected":8.4,"opponent":"CLE"},
      {"id":"11635","name":"Ladd McConkey","position":"WR","nfl_team":"LAC","injury_status":"Questionable","projected":10.9,"opponent":"LV"},
      {"id":"9484","name":"Tucker Kraft","position":"TE","nfl_team":"GB","injury_status":null,"projected":9.9,"opponent":"NYJ"},
      {"id":"8132","name":"Tyler Allgeier","position":"RB","nfl_team":"ARI","injury_status":null,"projected":5.7,"opponent":"SEA"},
      {"id":"7543","name":"Travis Etienne","position":"RB","nfl_team":"NO","injury_status":null,"projected":8.9,"opponent":"BAL"},
      {"id":"BAL","name":"BAL D/ST","position":"DEF","nfl_team":"BAL","injury_status":null,"projected":9.2,"opponent":"NO"},
    ],
    bench: [
      {"id":"10219","name":"Chris Rodriguez","position":"RB","nfl_team":"JAX","injury_status":null,"projected":6.3,"opponent":"DEN"},
      {"id":"11563","name":"Bo Nix","position":"QB","nfl_team":"DEN","injury_status":null,"projected":15.7,"opponent":"JAX"},
      {"id":"12487","name":"Terrance Ferguson","position":"TE","nfl_team":"LAR","injury_status":null,"projected":2.9,"opponent":"NYG"},
      {"id":"5859","name":"A.J. Brown","position":"WR","nfl_team":"NE","injury_status":"IR","projected":0,"opponent":"—"},
      {"id":"8676","name":"Rashid Shaheed","position":"WR","nfl_team":"SEA","injury_status":null,"projected":6.6,"opponent":"ARI"},
    ],
  },
  { id: "8", name: "HusH", owner_name: "HusH", record: "2-0", points_for: 159.12,
    starters: [
      {"id":"11564","name":"Drake Maye","position":"QB","nfl_team":"NE","injury_status":null,"projected":18.9,"opponent":"PIT"},
      {"id":"9221","name":"Jahmyr Gibbs","position":"RB","nfl_team":"DET","injury_status":null,"projected":24.2,"opponent":"BUF"},
      {"id":"6790","name":"D'Andre Swift","position":"RB","nfl_team":"CHI","injury_status":null,"projected":10.1,"opponent":"MIN"},
      {"id":"12526","name":"Tetairoa McMillan","position":"WR","nfl_team":"CAR","injury_status":null,"projected":11.9,"opponent":"ATL"},
      {"id":"2216","name":"Mike Evans","position":"WR","nfl_team":"SF","injury_status":null,"projected":11.6,"opponent":"MIA"},
      {"id":"8131","name":"Isaiah Likely","position":"TE","nfl_team":"NYG","injury_status":null,"projected":7.4,"opponent":"LAR"},
      {"id":"7588","name":"Javonte Williams","position":"RB","nfl_team":"DAL","injury_status":null,"projected":16.2,"opponent":"WAS"},
      {"id":"2449","name":"Stefon Diggs","position":"WR","nfl_team":"WAS","injury_status":null,"projected":10.2,"opponent":"DAL"},
      {"id":"DET","name":"DET D/ST","position":"DEF","nfl_team":"DET","injury_status":null,"projected":5.3,"opponent":"BUF"},
    ],
    bench: [
      {"id":"11581","name":"MarShawn Lloyd","position":"RB","nfl_team":"GB","injury_status":null,"projected":10.2,"opponent":"NYJ"},
      {"id":"8142","name":"Alec Pierce","position":"WR","nfl_team":"IND","injury_status":"Questionable","projected":9.9,"opponent":"KC"},
      {"id":"9225","name":"Tank Bigsby","position":"RB","nfl_team":"PHI","injury_status":null,"projected":3.3,"opponent":"TEN"},
      {"id":"9486","name":"Dontayvion Wicks","position":"WR","nfl_team":"PHI","injury_status":null,"projected":6.8,"opponent":"TEN"},
      {"id":"9511","name":"Keaton Mitchell","position":"RB","nfl_team":"LAC","injury_status":null,"projected":5.6,"opponent":"LV"},
    ],
  },
  { id: "9", name: "Wait, another league?", owner_name: "philking", record: "2-0", points_for: 146.64,
    starters: [
      {"id":"3163","name":"Jared Goff","position":"QB","nfl_team":"DET","injury_status":null,"projected":16.3,"opponent":"BUF"},
      {"id":"12527","name":"Ashton Jeanty","position":"RB","nfl_team":"LV","injury_status":null,"projected":12.9,"opponent":"LAC"},
      {"id":"8155","name":"Breece Hall","position":"RB","nfl_team":"NYJ","injury_status":null,"projected":12.4,"opponent":"GB"},
      {"id":"9493","name":"Puka Nacua","position":"WR","nfl_team":"LAR","injury_status":null,"projected":16.6,"opponent":"NYG"},
      {"id":"8148","name":"Jameson Williams","position":"WR","nfl_team":"DET","injury_status":null,"projected":10.7,"opponent":"BUF"},
      {"id":"12517","name":"Colston Loveland","position":"TE","nfl_team":"CHI","injury_status":null,"projected":9.8,"opponent":"MIN"},
      {"id":"7594","name":"Chuba Hubbard","position":"RB","nfl_team":"CAR","injury_status":null,"projected":11.1,"opponent":"ATL"},
      {"id":"9487","name":"Parker Washington","position":"WR","nfl_team":"JAX","injury_status":null,"projected":9,"opponent":"DEN"},
      {"id":"LV","name":"LV D/ST","position":"DEF","nfl_team":"LV","injury_status":null,"projected":4.3,"opponent":"LAC"},
    ],
    bench: [
      {"id":"10222","name":"Jayden Reed","position":"WR","nfl_team":"GB","injury_status":null,"projected":10.2,"opponent":"NYJ"},
      {"id":"11560","name":"Caleb Williams","position":"QB","nfl_team":"CHI","injury_status":null,"projected":17.1,"opponent":"MIN"},
      {"id":"12474","name":"Woody Marks","position":"RB","nfl_team":"HOU","injury_status":null,"projected":6.6,"opponent":"CIN"},
      {"id":"13337","name":"Emmett Johnson","position":"RB","nfl_team":"KC","injury_status":null,"projected":2.9,"opponent":"IND"},
      {"id":"8126","name":"Wan'Dale Robinson","position":"WR","nfl_team":"TEN","injury_status":null,"projected":6,"opponent":"PHI"},
      {"id":"9753","name":"Zach Charbonnet","position":"RB","nfl_team":"SEA","injury_status":"PUP","projected":0,"opponent":"—"},
    ],
  },
  { id: "10", name: "Raft Ryders ", owner_name: "cuban1616", record: "1-1", points_for: 124.72,
    starters: [
      {"id":"6904","name":"Jalen Hurts","position":"QB","nfl_team":"PHI","injury_status":null,"projected":20.9,"opponent":"TEN"},
      {"id":"3198","name":"Derrick Henry","position":"RB","nfl_team":"BAL","injury_status":null,"projected":14.1,"opponent":"NO"},
      {"id":"9226","name":"De'Von Achane","position":"RB","nfl_team":"MIA","injury_status":null,"projected":15.4,"opponent":"SF"},
      {"id":"5045","name":"Courtland Sutton","position":"WR","nfl_team":"DEN","injury_status":null,"projected":7.9,"opponent":"JAX"},
      {"id":"12501","name":"Matthew Golden","position":"WR","nfl_team":"GB","injury_status":null,"projected":9.3,"opponent":"NYJ"},
      {"id":"8127","name":"Charlie Kolar","position":"TE","nfl_team":"LAC","injury_status":null,"projected":3.1,"opponent":"LV"},
      {"id":"11584","name":"Bucky Irving","position":"RB","nfl_team":"TB","injury_status":null,"projected":12.4,"opponent":"CLE"},
      {"id":"12490","name":"Bhayshul Tuten","position":"RB","nfl_team":"JAX","injury_status":null,"projected":8.2,"opponent":"DEN"},
      {"id":"DEN","name":"DEN D/ST","position":"DEF","nfl_team":"DEN","injury_status":null,"projected":6.9,"opponent":"JAX"},
    ],
    bench: [
      {"id":"11624","name":"Xavier Worthy","position":"WR","nfl_team":"KC","injury_status":null,"projected":8.2,"opponent":"IND"},
      {"id":"13285","name":"Malachi Fields","position":"WR","nfl_team":"NYG","injury_status":null,"projected":5.2,"opponent":"LAR"},
      {"id":"5849","name":"Kyler Murray","position":"QB","nfl_team":"MIN","injury_status":"Out","projected":0,"opponent":"—"},
      {"id":"6806","name":"J.K. Dobbins","position":"RB","nfl_team":"DEN","injury_status":null,"projected":8.7,"opponent":"JAX"},
      {"id":"8408","name":"Jordan Mason","position":"RB","nfl_team":"MIN","injury_status":"Questionable","projected":9.8,"opponent":"CHI"},
    ],
  },
  { id: "11", name: "Themagicman", owner_name: "Themagicman", record: "2-0", points_for: 137.76,
    starters: [
      {"id":"4984","name":"Josh Allen","position":"QB","nfl_team":"BUF","injury_status":null,"projected":21.9,"opponent":"DET"},
      {"id":"4034","name":"Christian McCaffrey","position":"RB","nfl_team":"SF","injury_status":null,"projected":17.3,"opponent":"MIA"},
      {"id":"7021","name":"Rico Dowdle","position":"RB","nfl_team":"PIT","injury_status":null,"projected":9.9,"opponent":"NE"},
      {"id":"8144","name":"Chris Olave","position":"WR","nfl_team":"NO","injury_status":null,"projected":12.7,"opponent":"BAL"},
      {"id":"8167","name":"Christian Watson","position":"WR","nfl_team":"GB","injury_status":null,"projected":12.8,"opponent":"NYJ"},
      {"id":"4217","name":"George Kittle","position":"TE","nfl_team":"SF","injury_status":null,"projected":9.3,"opponent":"MIA"},
      {"id":"13286","name":"Jadarian Price","position":"RB","nfl_team":"SEA","injury_status":null,"projected":11.1,"opponent":"ARI"},
      {"id":"11586","name":"Blake Corum","position":"RB","nfl_team":"LAR","injury_status":null,"projected":10.3,"opponent":"NYG"},
      {"id":"NE","name":"NE D/ST","position":"DEF","nfl_team":"NE","injury_status":null,"projected":8.5,"opponent":"PIT"},
    ],
    bench: [
      {"id":"10213","name":"Tre Tucker","position":"WR","nfl_team":"LV","injury_status":null,"projected":6.8,"opponent":"LAC"},
      {"id":"11610","name":"Malik Washington","position":"WR","nfl_team":"MIA","injury_status":null,"projected":7.1,"opponent":"SF"},
      {"id":"13417","name":"De'Zhaun Stribling","position":"WR","nfl_team":"SF","injury_status":"Out","projected":0,"opponent":"MIA"},
      {"id":"8183","name":"Brock Purdy","position":"QB","nfl_team":"SF","injury_status":null,"projected":20.8,"opponent":"MIA"},
      {"id":"9500","name":"Josh Downs","position":"WR","nfl_team":"IND","injury_status":null,"projected":8.3,"opponent":"KC"},
    ],
  },
  { id: "12", name: "2KSports", owner_name: "2KSports", record: "2-0", points_for: 156.16,
    starters: [
      {"id":"6770","name":"Joe Burrow","position":"QB","nfl_team":"CIN","injury_status":null,"projected":17.8,"opponent":"HOU"},
      {"id":"11583","name":"Jonathon Brooks","position":"RB","nfl_team":"CAR","injury_status":null,"projected":5.8,"opponent":"ATL"},
      {"id":"12512","name":"Quinshon Judkins","position":"RB","nfl_team":"CLE","injury_status":null,"projected":11.7,"opponent":"TB"},
      {"id":"7547","name":"Amon-Ra St. Brown","position":"WR","nfl_team":"DET","injury_status":null,"projected":14.2,"opponent":"BUF"},
      {"id":"6794","name":"Justin Jefferson","position":"WR","nfl_team":"MIN","injury_status":null,"projected":14.8,"opponent":"CHI"},
      {"id":"8130","name":"Trey McBride","position":"TE","nfl_team":"ARI","injury_status":null,"projected":11.5,"opponent":"SEA"},
      {"id":"5846","name":"DK Metcalf","position":"WR","nfl_team":"PIT","injury_status":null,"projected":10.1,"opponent":"NE"},
      {"id":"11646","name":"Jalen Coker","position":"WR","nfl_team":"CAR","injury_status":"Questionable","projected":10.3,"opponent":"ATL"},
      {"id":"JAX","name":"JAX D/ST","position":"DEF","nfl_team":"JAX","injury_status":null,"projected":6.3,"opponent":"DEN"},
    ],
    bench: [
      {"id":"11603","name":"AJ Barner","position":"TE","nfl_team":"SEA","injury_status":null,"projected":6.9,"opponent":"ARI"},
      {"id":"11655","name":"Tyrone Tracy","position":"RB","nfl_team":"NYG","injury_status":null,"projected":1.6,"opponent":"LAR"},
      {"id":"12529","name":"TreVeyon Henderson","position":"RB","nfl_team":"NE","injury_status":"Out","projected":8.4,"opponent":"PIT"},
      {"id":"13298","name":"KC Concepcion","position":"WR","nfl_team":"CLE","injury_status":null,"projected":8.4,"opponent":"TB"},
      {"id":"5870","name":"Daniel Jones","position":"QB","nfl_team":"IND","injury_status":null,"projected":14.7,"opponent":"KC"},
      {"id":"8136","name":"Rachaad White","position":"RB","nfl_team":"WAS","injury_status":null,"projected":8,"opponent":"DAL"},
    ],
  },
];

export const STARTING_SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "DEF"];

// Free headshots / logos, same URLs the API emits.
/**
 * A mock offer's player records and its name list must describe the same two players —
 * the engine derives both from one list (`trade_finder.py`), so a mock that pairs a
 * hard-coded name with an unrelated roster slot shows a trade nobody proposed.
 */
function offerSide(teamId: string, ids: string[]): { players: Player[]; names: string[] } {
  const players = ids.map((id) => {
    const found = allPlayers(teamId).find((p) => p.id === id);
    if (!found) throw new Error(`mock offer references ${id}, which is not on team ${teamId}`);
    return withPhoto(found);
  });
  return { players, names: players.map((p) => p.name) };
}

function withPhoto(p: Player): Player {
  const team = (p.nfl_team ?? "").toLowerCase();
  const team_logo = team ? `https://sleepercdn.com/images/team_logos/nfl/${team}.png` : null;
  const photo = p.position === "DEF" ? team_logo : /^\d+$/.test(p.id) ? `https://sleepercdn.com/content/nfl/players/thumb/${p.id}.jpg` : null;
  return { ...p, photo, team_logo };
}
for (const r of ROSTERS) {
  r.starters = r.starters.map(withPhoto);
  r.bench = r.bench.map(withPhoto);
}

export function rosterFor(teamId: string): MockRoster {
  return ROSTERS.find((r) => r.id === teamId) ?? ROSTERS[0];
}

export function allPlayers(teamId: string): Player[] {
  const r = rosterFor(teamId);
  return [...r.starters, ...r.bench];
}

export const LEAGUE: LeagueSummary = {
  id: LEAGUE_ID,
  platform: "sleeper",
  name: "The Megalabowl",
  season: 2026,
  week: WEEK,
  waiver_type: "faab",
  faab_budget: 100,
  starting_slots: STARTING_SLOTS,
  teams: ROSTERS.map<TeamSummary>((r) => ({
    id: r.id,
    name: r.name,
    owner_name: r.owner_name,
    record: r.record,
    points_for: r.points_for,
    faab_remaining: 100,
  })),
};

export const ME: Me = {
  email: "you@example.com",
  // The real free tier, per edge/products.py: start/sit only. This used to hand out the Wire
  // Pass for free, which contradicted the product catalogue and made the wire impossible to
  // see in its locked state. Everything above this comes from `mockExtraEntitlements`.
  entitlements: ["my_team"],
  leagues_allowed: 1,
  leagues: [{ platform: "sleeper", league_id: LEAGUE_ID, name: "The Megalabowl", team_id: MY_TEAM_ID }],
};

// ---------- Lineup ----------

function confidenceFor(margin: number): Confidence {
  if (margin >= 4) return "Lock";
  if (margin >= 1.5) return "Lean";
  return "Coin flip";
}

/** Recommended lineup for HusH (team 8): swap Diggs -> Lloyd at FLEX. */
export function lineupFor(teamId: string): Lineup {
  const r = rosterFor(teamId);
  const starters = r.starters.filter((p) => p.id !== "0");
  const bench = [...r.bench];
  const changes: LineupChange[] = [];

  let slots: LineupSlot[] = STARTING_SLOTS.map((slot, i) => {
    const player = starters[i] ?? starters[starters.length - 1];
    const options = bench.filter((b) => eligible(slot, b.position)).map((b) => b.projected);
    const margin = options.length ? player.projected - Math.max(...options) : Infinity;
    return {
      slot,
      player,
      confidence: confidenceFor(margin),
      reason: reasonFor(slot, player, margin),
      change: false,
    };
  });

  if (teamId === MY_TEAM_ID) {
    const lloyd = bench.find((b) => b.id === "11581");
    const diggsIdx = slots.findIndex((s) => s.player?.id === "2449");
    if (lloyd && diggsIdx >= 0) {
      const boosted: Player = { ...lloyd, projected: 11.2 };
      const diggs = slots[diggsIdx].player as Player;
      const gain = +(boosted.projected - diggs.projected).toFixed(1);
      changes.push({
        slot: "FLEX",
        out: { id: diggs.id, name: diggs.name },
        in: { id: boosted.id, name: boosted.name },
        gain,
        confidence: confidenceFor(gain),
        reason: "Lloyd draws the NYJ run defense with GB favored by 6; Diggs has been a decoy in WAS's first two games.",
      });
      slots = slots.map((s, i) =>
        i === diggsIdx
          ? { ...s, player: boosted, confidence: "Coin flip", change: true, reason: `Coin flip over Diggs (${signed(gain)}). Playable either way; Lloyd has the better game script.` }
          : s,
      );
      bench.splice(bench.indexOf(lloyd), 1, { ...diggs });
    }
  }

  const projected_total = round1(slots.reduce((a, s) => a + (s.player?.projected ?? 0), 0));
  const current_total = round1(projected_total - changes.reduce((a, c) => a + c.gain, 0));
  const lastFlex = Math.min(...slots.filter((s) => s.slot === "FLEX").map((s) => s.player?.projected ?? 0));

  return {
    week: WEEK,
    projected_total,
    current_total,
    slots,
    bench: bench.map((p) => ({
      player: p,
      reason:
        p.injury_status === "Questionable"
          ? `Sit: ${p.projected.toFixed(1)} proj and listed ${p.injury_status}. Check Sunday status.`
          : `Sit: ${p.projected.toFixed(1)} proj, ${Math.max(0, lastFlex - p.projected).toFixed(1)} behind your last FLEX.`,
    })),
    changes,
    grades: gradesFor(r),
  };
}

/* ---------- Scorecard ----------
   A fixed spread of letters (one A-ish, one C-ish, one F, and a mix of depth
   readings) so the scorecard design is exercised, with the names underneath
   pulled off whichever roster is being graded. `starters` folds FLEX in: this
   league starts 2 RB + 2 WR + 2 FLEX, which in practice is 3 and 3.            */

const GRADE_ROWS: { position: string; grade: Grade; percentile: number; rank: number; starters: number; depth: Depth }[] = [
  { position: "RB", grade: "A-", percentile: 0.86, rank: 2, starters: 3, depth: "deep" },
  { position: "WR", grade: "C+", percentile: 0.54, rank: 7, starters: 3, depth: "ok" },
  { position: "QB", grade: "B", percentile: 0.68, rank: 5, starters: 1, depth: "thin" },
  { position: "TE", grade: "D+", percentile: 0.24, rank: 10, starters: 1, depth: "thin" },
  { position: "DEF", grade: "F", percentile: 0.07, rank: 12, starters: 1, depth: "ok" },
];

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];

function gradesFor(r: MockRoster): Grades {
  const size = ROSTERS.length;
  const positions: PositionGrade[] = GRADE_ROWS.map((row) => {
    const names = r.starters.filter((p) => p.position === row.position).map((p) => p.name).slice(0, row.starters);
    const behind = r.bench.filter((p) => p.position === row.position).sort((a, b) => b.projected - a.projected);
    const next_man = behind[0]?.name ?? null;
    const place = `${ORDINAL[row.rank] ?? `${row.rank}th`} of ${size} at ${row.position}`;
    const note =
      row.depth === "deep" && next_man
        ? `${place}. ${next_man} is the next man up and he can start.`
        : row.depth === "thin" && next_man
          ? `${place}. ${next_man} is the drop-off, and it is a real one.`
          : row.depth === "thin"
            ? `${place}. Nothing behind the starter if he sits.`
            : row.position === "DEF"
              ? `${place}. Stream it — the wire fixes this one cheap.`
              : `${place}. Covered, not stacked.`;
    return {
      position: row.position,
      grade: row.grade,
      percentile: row.percentile,
      starters: row.starters,
      rank: row.rank,
      league_size: size,
      depth: row.depth,
      starter_names: names,
      next_man,
      note,
    };
  });
  return {
    overall: "B+",
    overall_percentile: 0.74,
    overall_rank: 3,
    league_size: size,
    note: `3rd of ${size} on rest-of-season starting value. The backs carry it; tight end and defense are the leaks.`,
    positions,
  };
}

function eligible(slot: string, pos: string): boolean {
  if (slot === "FLEX") return pos === "RB" || pos === "WR" || pos === "TE";
  return slot === pos;
}

function reasonFor(slot: string, p: Player, margin: number): string {
  if (margin === Infinity) return `Only ${p.position} on your roster. ${p.projected.toFixed(1)} proj vs ${p.opponent}.`;
  if (margin >= 4) return `Top ${slot} projection this week (${p.projected.toFixed(1)}). Nobody on your bench is close.`;
  if (margin >= 1.5) return `Lean start: ${p.projected.toFixed(1)} proj, ${margin.toFixed(1)} clear of your best bench option vs ${p.opponent}.`;
  return `Coin flip: within ${Math.abs(margin).toFixed(1)} of your best bench option. Check inactives before kickoff.`;
}

// ---------- Waivers ----------

export const WAIVERS: Waivers = {
  week: WEEK,
  faab_remaining: 100,
  picks: [
    {
      player: { id: "8134", name: "Khalil Shakir", position: "WR", nfl_team: "BUF", injury_status: null, projected: 8.7, opponent: "DET" },
      fit_score: 7.3,
      weekly_gain: 2.1,
      ros_gain: 18.4,
      trending_adds: 40212,
      drop: { id: "9225", name: "Tank Bigsby", position: "RB" },
      bid: { amount: 12, range: [8, 15], pct_of_budget: 12 },
      reason: "Slots into your FLEX now and WR3 for the rest of the season. Bye-week cover for McMillan (wk 8).",
    },
    {
      player: { id: "11370", name: "Chris Brooks", position: "RB", nfl_team: "GB", injury_status: null, projected: 7.2, opponent: "NYJ" },
      fit_score: 6.1,
      weekly_gain: 0.4,
      ros_gain: 11.0,
      trending_adds: 28810,
      drop: { id: "9511", name: "Keaton Mitchell", position: "RB" },
      bid: { amount: 7, range: [4, 10], pct_of_budget: 7 },
      reason: "Handcuff with standalone value: 9 touches a game behind Lloyd. Your RB depth is thin after Gibbs.",
    },
    {
      player: { id: "7049", name: "Jauan Jennings", position: "WR", nfl_team: "MIN", injury_status: null, projected: 7.8, opponent: "CHI" },
      fit_score: 5.6,
      weekly_gain: 1.0,
      ros_gain: 9.2,
      trending_adds: 15530,
      drop: { id: "9486", name: "Dontayvion Wicks", position: "WR" },
      bid: { amount: 5, range: [3, 8], pct_of_budget: 5 },
      reason: "Second target in MIN behind Jefferson. Straight upgrade on Wicks for the same roster spot.",
    },
    {
      player: { id: "5001", name: "Dalton Schultz", position: "TE", nfl_team: "HOU", injury_status: null, projected: 8.0, opponent: "CIN" },
      fit_score: 4.9,
      weekly_gain: 0.6,
      ros_gain: 6.5,
      trending_adds: 9120,
      drop: { id: "9225", name: "Tank Bigsby", position: "RB" },
      bid: { amount: 3, range: [1, 5], pct_of_budget: 3 },
      reason: "Likely has been a Coin flip at TE two weeks running. Schultz gives you a second option for bad matchups.",
    },
    {
      player: { id: "7571", name: "Rashod Bateman", position: "WR", nfl_team: "BAL", injury_status: null, projected: 7.2, opponent: "NO" },
      fit_score: 4.2,
      weekly_gain: 0.3,
      ros_gain: 5.8,
      trending_adds: 6040,
      drop: { id: "9486", name: "Dontayvion Wicks", position: "WR" },
      bid: { amount: 2, range: [1, 4], pct_of_budget: 2 },
      reason: "Zay Flowers is out; Bateman soaks up targets in a BAL offense that scores. Stash, not a starter yet.",
    },
  ],
};

// ---------- Trade Lab ----------

const TENDENCIES: Record<string, typeof DEFAULT_TENDENCIES> = {
  "4": { trades: 2, waiver_claims: 9, avg_bid: 14, favorite_positions: ["RB"], style: "active dealer" },
  "9": { trades: 0, waiver_claims: 3, avg_bid: 6, favorite_positions: ["WR", "TE"], style: "sits on his roster" },
  "12": { trades: 3, waiver_claims: 12, avg_bid: 21, favorite_positions: ["RB", "WR"], style: "FAAB spender" },
};

const DEFAULT_TENDENCIES: Required<Pick<Tendencies, "trades" | "waiver_claims" | "avg_bid" | "favorite_positions" | "style">> = {
  trades: 1, waiver_claims: 5, avg_bid: 9, favorite_positions: ["WR"], style: "quiet",
};

/** Rest-of-season value: a cheap stand-in for the engine's ROS number. */
export function rosValue(p: Player): number {
  const mult: Record<string, number> = { QB: 2.6, RB: 4.3, WR: 4.0, TE: 3.4, DEF: 1.2, K: 1.0 };
  const injury = p.injury_status === "Out" || p.injury_status === "IR" || p.injury_status === "PUP" ? 0.55 : 1;
  return round1((p.projected ?? 0) * (mult[p.position] ?? 3) * injury);
}

export function evaluateTrade(req: TradeRequest): TradeResult {
  const mine = allPlayers(req.my_team_id);
  const theirs = allPlayers(req.their_team_id);
  const give = req.give.map((id) => mine.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const get = req.get.map((id) => theirs.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const value_out = round1(give.reduce((a, p) => a + rosValue(p), 0));
  const value_in = round1(get.reduce((a, p) => a + rosValue(p), 0));
  const weekOut = give.reduce((a, p) => a + (p.projected ?? 0), 0);
  const weekIn = get.reduce((a, p) => a + (p.projected ?? 0), 0);
  const fairness = value_in && value_out ? round2(Math.min(value_in, value_out) / Math.max(value_in, value_out)) : 0;
  const ratio = value_out ? value_in / value_out : 0;

  let verdict: Verdict;
  if (ratio >= 1.12) verdict = "Accept";
  else if (ratio >= 0.95) verdict = "Fair";
  else if (ratio >= 0.8) verdict = "Counter";
  else verdict = "Reject";

  const tend = TENDENCIES[req.their_team_id] ?? DEFAULT_TENDENCIES;
  const theirName = rosterFor(req.their_team_id).name;
  const names = (ps: Player[]) => ps.map((p) => p.name).join(" + ") || "nothing";

  let counter: TradeResult["counter"] = null;
  if (verdict === "Counter" || verdict === "Reject") {
    const keep = [...get].sort((a, b) => rosValue(b) - rosValue(a));
    const bestGive = [...give].sort((a, b) => rosValue(b) - rosValue(a));
    counter = {
      give: bestGive.slice(0, 1).map((p) => p.id),
      get: keep.slice(0, Math.max(1, get.length)).map((p) => p.id),
      give_names: bestGive.slice(0, 1).map((p) => p.name),
      get_names: keep.slice(0, Math.max(1, get.length)).map((p) => p.name),
      why: `${theirName} ${tend.favorite_positions.includes("RB") ? "hoards RBs" : `chases ${tend.favorite_positions.join("/")}`}; giving up ${names(give)} for this package leaves you short. Offer ${names(bestGive.slice(0, 1))} one-for-${keep.length} instead.`,
    };
  }

  const explanation =
    verdict === "Accept"
      ? `You send out ${value_out.toFixed(1)} of rest-of-season value and get ${value_in.toFixed(1)} back. ${names(get)} improves your lineup by ${signed(weekIn - weekOut)} this week and roughly ${signed((value_in - value_out) / 8)} a week after that. ${theirName} is an ${tend.style}, so take the deal before they rethink it.`
      : verdict === "Fair"
        ? `This is close to even: ${value_out.toFixed(1)} out, ${value_in.toFixed(1)} in. The week-2 swing is ${signed(weekIn - weekOut)}. Do it if you need the positional balance, otherwise there is no urgency. ${theirName} has made ${tend.trades} trades this year and tends to favor ${tend.favorite_positions.join("/")}.`
        : `You would give up ${value_out.toFixed(1)} of value for ${value_in.toFixed(1)}, a ${Math.round((1 - ratio) * 100)}% haircut. ${theirName} (${tend.style}) has ${tend.waiver_claims} waiver claims at an average bid of $${tend.avg_bid}, so they value depth. The counter below keeps your best piece in play without insulting them.`;

  const graphic: TradeResult["graphic"] = {
    title: `${verdict}: ${names(give)} for ${names(get)}`,
    give: give.map((p) => p.name),
    get: get.map((p) => p.name),
    my_delta_ros: round1((value_in - value_out) / 4),
    their_delta_ros: round1((value_out - value_in) / 4),
    fairness,
    style: tend.style ?? null,
  };

  return {
    verdict,
    me: { value_out, value_in, lineup_delta_week: round1(weekIn - weekOut), lineup_delta_ros: round1((value_in - value_out) / 4) },
    them: { value_out: value_in, value_in: value_out, lineup_delta_week: round1(weekOut - weekIn), lineup_delta_ros: round1((value_out - value_in) / 4) },
    fairness,
    their_tendencies: tend,
    counter,
    notes: ratio > 1.4 ? ["Lopsided in your favor — they are unlikely to accept as-is."] : [],
    explanation,
    explanation_source: "template",
    graphic,
  };
}

// ---------- Waiver plan / Trade finder ----------

export const WAIVER_PLAN: WaiverPlanResponse = {
  week: WEEK,
  faab_remaining: 100,
  waiver_type: "faab",
  primary: {
    add: withPhoto(WAIVERS.picks[0].player),
    drop: withPhoto(allPlayers(MY_TEAM_ID).slice(-1)[0]),
    net: 1.42,
    weekly_gain: 2.1,
    ros_gain: 18,
    drop_cost: 0.04,
    bid: { amount: 14, range: [11, 19], pct_of_budget: 14, value_cap: 31, market: 12 },
    reason: "Starts for you this week (+2.1). Adds 18 points to your lineup rest of season. Covers Jahmyr Gibbs's week 6 bye. Drop Tank Bigsby.",
    reason_codes: ["starts_immediately", "covers_bye", "roster_depth"],
    trending_adds: 35811,
  },
  fallbacks: [
    {
      add: withPhoto(WAIVERS.picks[1].player),
      drop: withPhoto(allPlayers(MY_TEAM_ID).slice(-1)[0]),
      net: 0.86,
      weekly_gain: 1.2,
      ros_gain: 9,
      drop_cost: 0.04,
      bid: { amount: 8, range: [6, 11], pct_of_budget: 8, value_cap: 19, market: 12 },
      reason: "Depth and insurance, not a starter. Clear best RB left on the wire. Drop Tank Bigsby.",
      reason_codes: ["position_scarcity", "roster_depth"],
      trending_adds: 20130,
    },
  ],
  hold_reason: null,
  total_planned_spend: 22,
  algo_version: "waiver_plan.v1",
};

export const TRADE_FINDER: TradeFinderResponse = {
  week: WEEK,
  my_positions: { surplus: { WR: 106.1, QB: 61.4 }, need: { RB: 88.2, TE: 12.4 } },
  summary: "FxxxKroenke is your best trade partner. You are WR-heavy, FxxxKroenke is RB-heavy.",
  partners: [
    {
      team_id: "4",
      team_name: "FxxxKroenke",
      owner_name: "FxxxKroenke",
      complement: 1.84,
      headline: "You are WR-heavy, FxxxKroenke is RB-heavy.",
      positions: { surplus: { RB: 74.2 }, need: { WR: 61.9 } },
      offers: [
        {
          their_team_id: "4", their_team_name: "FxxxKroenke",
          give: ["2449"], get: ["7526"],
          give_names: offerSide(MY_TEAM_ID, ["2449"]).names, get_names: offerSide("4", ["7526"]).names,
          give_players: offerSide(MY_TEAM_ID, ["2449"]).players, get_players: offerSide("4", ["7526"]).players,
          my_gain_ros: 21, their_gain_ros: 6, my_gain_week: 1.4,
          fairness: 0.91, verdict: "Fair", score: 27.4,
          why: "You gain 21 rest-of-season lineup points, they gain 6. Value is 91% balanced. This manager has acquired WRs in 3 of their last 5 moves.",
          reason_codes: ["both_sides_improve", "one_for_one", "matches_their_history"],
        },
      ],
    },
    {
      team_id: "9", team_name: "philking", owner_name: "philking", complement: 0.92,
      headline: "philking has RB to spare and you need one.",
      positions: { surplus: { RB: 42.0 }, need: { TE: 18.1 } },
      offers: [
        {
          their_team_id: "9", their_team_name: "philking",
          give: ["6790"], get: ["7594"],
          give_names: offerSide(MY_TEAM_ID, ["6790"]).names, get_names: offerSide("9", ["7594"]).names,
          give_players: offerSide(MY_TEAM_ID, ["6790"]).players, get_players: offerSide("9", ["7594"]).players,
          my_gain_ros: 11, their_gain_ros: 4, my_gain_week: 0.6,
          fairness: 0.95, verdict: "Fair", score: 17.2,
          why: "You gain 11 rest-of-season lineup points, they gain 4. Value is 95% balanced.",
          reason_codes: ["both_sides_improve", "one_for_one"],
        },
      ],
    },
  ],
  algo_version: "trade_finder.v1",
};

// ---------- Action feed (home) ----------

export function actionsFor(teamId: string, entitlements: Feature[]): ActionFeed {
  const lineup = lineupFor(teamId);
  const actions: Action[] = [];
  for (const ch of lineup.changes) {
    const inP = allPlayers(teamId).find((p) => p.id === ch.in.id) ?? null;
    const outP = ch.out ? (allPlayers(teamId).find((p) => p.id === ch.out!.id) ?? null) : null;
    actions.push({
      id: `start:${ch.slot}:${ch.in.id}`, type: "start", feature: "my_team", locked: false, priority: 0,
      title: `Start ${ch.in.name} over ${ch.out?.name ?? "an empty slot"}`,
      subtitle: `${ch.slot} · ${inP?.position ?? ""} ${inP?.nfl_team ?? ""}`,
      benefit: `+${ch.gain.toFixed(1)} projected points`, benefit_value: ch.gain,
      confidence: ch.confidence, reason: ch.reason,
      why: [`${ch.in.name} projects ${inP?.projected.toFixed(1)}.`, `${ch.out?.name ?? "The slot"} projects ${outP?.projected.toFixed(1) ?? "0.0"}.`, `${ch.confidence}: margins this size were right about ${ch.confidence === "Lock" ? 80 : ch.confidence === "Lean" ? 62 : 51}% of the time last week.`],
      players: [inP ? withPhoto(inP) : null, outP ? withPhoto(outP) : null],
      cta: { label: "See lineup", href: "/team" },
    });
  }
  const w = WAIVERS.picks[0];
  if (entitlements.includes("waivers")) {
    actions.push({
      id: `waiver:${w.player.id}`, type: "waiver", feature: "waivers", locked: false, priority: 0,
      title: `Add ${w.player.name}`, subtitle: `Bid $${w.bid.range?.[0]}–${w.bid.range?.[1]} · Drop ${w.drop?.name}`,
      benefit: `+${w.weekly_gain.toFixed(1)} this week · +${w.ros_gain.toFixed(0)} ROS`, benefit_value: w.fit_score,
      confidence: "Lean", reason: w.reason,
      why: [`Fit score ${w.fit_score.toFixed(1)}.`, `${w.trending_adds.toLocaleString()} managers added him in the last 48h.`, `Bid is ${w.bid.pct_of_budget}% of your budget.`],
      players: [withPhoto(w.player), null], cta: { label: "View waiver plan", href: "/waivers" },
    });
  } else {
    actions.push({
      id: "waiver:locked", type: "waiver", feature: "waivers", locked: true, priority: 0,
      title: "2 waiver adds improve your roster", subtitle: "#1 would become your FLEX immediately",
      benefit: `+${w.weekly_gain.toFixed(1)} this week · +${w.ros_gain.toFixed(0)} ROS`, benefit_value: w.fit_score,
      confidence: null, reason: "Unlock Waivers to see names, bids and who to drop.", why: [], players: [],
      cta: { label: "Unlock Waivers", href: "/waivers" },
    });
  }
  const t = reportFor(teamId).trade_targets[0];
  if (entitlements.includes("trade_lab")) {
    actions.push({
      id: `trade:${t.their_team_id}`, type: "trade", feature: "trade_lab", locked: false, priority: 0,
      title: `Offer ${t.give_names[0]} for ${t.get_names[0]}`, subtitle: `to ${t.their_team_name} · both teams improve`,
      benefit: `+${t.my_gain_ros.toFixed(0)} ROS lineup points`, benefit_value: t.my_gain_ros, confidence: "Lean", reason: t.why,
      why: [`Your lineup gains ${t.my_gain_ros.toFixed(0)} rest-of-season points.`, `Theirs gains ${t.their_gain_ros.toFixed(0)}, so it is askable.`],
      // Resolved defensively. This was two `find(...)!` non-null assertions, and the
      // assertion was a lie: the target's give id belongs to MY_TEAM_ID, so for every other
      // team `find` returned undefined and the whole call sheet crashed on
      // `undefined.nfl_team` the moment Trade Lab was unlocked. A missing face is fine —
      // ActionCard already renders without one.
      players: [
        allPlayers(teamId).find((p) => p.id === t.give[0]),
        allPlayers(t.their_team_id).find((p) => p.id === t.get[0]),
      ].filter((p): p is Player => !!p).map(withPhoto),
      cta: { label: "Open in Trade Lab", href: `/trade?their=${t.their_team_id}&give=${t.give[0]}&get=${t.get[0]}` },
    });
  } else {
    actions.push({
      id: "trade:locked", type: "trade", feature: "trade_lab", locked: true, priority: 0,
      title: `A trade with ${t.their_team_name} improves both teams`, subtitle: `1-for-1 · you gain +${t.my_gain_ros.toFixed(0)} ROS lineup points`,
      benefit: `+${t.my_gain_ros.toFixed(0)} ROS`, benefit_value: t.my_gain_ros, confidence: null,
      reason: "Unlock Trade Lab to see the offer and a counter tuned to them.", why: [], players: [],
      cta: { label: "Unlock Trade Lab", href: "/trade" },
    });
  }
  actions.sort((a, b) => b.benefit_value - a.benefit_value);
  actions.forEach((a, i) => (a.priority = i + 1));
  return {
    week: WEEK, team: rosterFor(teamId).name, league: LEAGUE.name,
    projected_total: lineup.projected_total, current_total: lineup.current_total,
    summary: `${actions.length} moves worth making`, all_clear: false, footer: "Everything else looks fine.",
    matchup: { opponent: "Wait, another league?", my_proj: lineup.projected_total, their_proj: 108.9, win_prob: 0.61 },
    actions, entitlements, synced_at: Date.now() / 1000 - 120,
  };
}

// ---------- Full report ----------

export function reportFor(teamId: string): Report {
  const lineup = lineupFor(teamId);
  return {
    week: WEEK,
    lineup,
    waivers: WAIVERS,
    trade_targets: [
      {
        their_team_id: "4",
        their_team_name: "FxxxKroenke",
        give: ["2449"],
        get: ["7526"],
        give_names: ["Stefon Diggs"],
        get_names: ["Jaylen Waddle"],
        my_gain_ros: 6.2,
        their_gain_ros: 2.1,
        verdict: "Fair",
        why: "FxxxKroenke is 0-2 and an active dealer. Even swap on value; Waddle's target share in DEN is the safer floor.",
      },
      {
        their_team_id: "9",
        their_team_name: "philking",
        give: ["6790"],
        get: ["7594"],
        give_names: ["D'Andre Swift"],
        get_names: ["Chuba Hubbard"],
        my_gain_ros: 4.8,
        their_gain_ros: 1.0,
        verdict: "Fair",
        why: "philking has six RBs and sits on his roster. Hubbard's role is safer than Swift's in CHI; ask, don't chase.",
      },
    ],
    matchup: { opponent: "Wait, another league?", my_proj: lineup.projected_total, their_proj: 108.9, win_prob: 0.61 },
    waiver_plan: WAIVER_PLAN,
    trade_finder: TRADE_FINDER,
    html: "",
  };
}

// ---------- helpers ----------

export function hasFeature(me: Me, f: Feature): boolean {
  return me.entitlements.includes(f);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function signed(n: number): string {
  const s = n.toFixed(1);
  return n > 0 ? `+${s}` : s;
}
