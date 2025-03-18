import requests
import json
import argparse
import copy

def sortByDate(el):
    return (el["date"], el["zlaggableSlug"])

def climbKey(ascent):
    return ("area-blank" if ascent["areaSlug"] is None else ascent["areaSlug"]) + ascent["cragSlug"] + ascent["sectorSlug"] + ascent["zlaggableSlug"]

def getJsonBoulderScorecards(sid, user_ids):
    
    print("Starting 8a scrape")
    ret = {}
    with requests.Session() as session:

        print("  Getting ticklist(s) from 8a.....")
        for user_id in user_ids:
            print("    Getting {}s ticklist from 8a.....".format(user_id))
            r = session.get("http://localhost:8091/{}/{}".format(sid, user_id), timeout=120)
            print("    ...done {}".format(r))
            ret[user_id] = json.loads(r.content)

            # r = session.get("http://localhost:8091/recommend/{}/{}".format(sid, user_id), timeout=120)
            # recommends = json.loads(r.content)["ascents"]
            # recommendMap = {}
            # for recommend in recommends:
            #     recommendMap[climbKey(recommend)] = True

            # for ascent in ret[user_id]["ascents"]:
            #     if climbKey(ascent) in recommendMap:
            #         ascent["recommend"] = True

            ret[user_id]["ascents"].sort(key=sortByDate)

    return ret

def getJsonBoulderScorecardsFromLocal(user_ids):
    
    print("Starting 8a scrape")
    ret = {}

    print("  Getting ticklist(s) from local.....")
    for user_id in user_ids:
        print("    Getting {}s ticklist from local.....".format(user_id))
        with open("./raw-8a-json/{}.json".format(user_id), 'r', encoding='utf-8') as f:
            ret[user_id] = json.load(f)
        ret[user_id]["ascents"].sort(key=sortByDate)
    return ret

if __name__ == "__main__":
    parser = argparse.ArgumentParser( description='Pull json scorecards')
    parser.add_argument('sid', type=str, help='The Session ID Cookie to allow API access')
    parser.add_argument('user_ids', type=str, help='The user IDs you wish to scrape, separated by ","s no spaces')
    parser.add_argument('--out_dir', type=str, default='./',help='Destination folder. Filenames will be "user_id".json')
    parser.add_argument('--use_manual_json', type=bool, default=False, help='8a.nu APIs suck. a flag to just use manually saved JSON files')
    parser.add_argument('--verbose', type=bool, default=False, help='Log a bit more to the console')
    args = parser.parse_args()

    if (args.use_manual_json):
        scorecards = getJsonBoulderScorecardsFromLocal(args.user_ids.split(','))
    else:
        scorecards = getJsonBoulderScorecards(args.sid, args.user_ids.split(','))

    for user_id in scorecards:
         print("    Writing {}s ticklist to {}/{}.json".format(user_id, args.out_dir, user_id))
         with open(args.out_dir + "/" + user_id + '.json', 'w+', encoding='utf-8', newline='\n') as of:
            of.write('{\r\n    "ascents": [\r\n')
            ascents = scorecards[user_id]["ascents"]
            unique_set = set()
            for index, ascent in enumerate(ascents):

                # Remove Duplicate Entry Logic
                tmp_ascent = ascent
                ascent_without_id = copy.copy(ascent)
                del ascent_without_id["ascentId"]
                full_hashed_ascent_key = json.dumps(ascent_without_id, ensure_ascii=True, separators=(',', ':'))
                if full_hashed_ascent_key in unique_set and ascent["zlaggableSlug"] != "unknown":
                    print("      > Duplicate Entry Skipped: {}".format(ascent["zlaggableSlug"]))
                    if args.verbose:
                        print("\n        {}\n".format(full_hashed_ascent_key))
                    continue
                unique_set.add(full_hashed_ascent_key)

                of.write("        ")
                json.dump(ascent, of, ensure_ascii=True, separators=(',', ':'))
                if index != len(ascents) - 1:
                    of.write(",\r\n")
            of.write('\r\n    ]\r\n}')
    print("...done")

