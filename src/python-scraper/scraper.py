import requests
import datetime
import re
import os.path
import json
import argparse

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
            r = session.get("http://localhost:8080/{}/{}".format(sid, user_id), timeout=120)
            print("    ...done {}".format(r))
            ret[user_id] = json.loads(r.content)

            r = session.get("http://localhost:8080/recommend/{}/{}".format(sid, user_id), timeout=120)
            recommends = json.loads(r.content)["ascents"]
            recommendMap = {}
            for recommend in recommends:
                recommendMap[climbKey(recommend)] = True

            for ascent in ret[user_id]["ascents"]:
                if climbKey(ascent) in recommendMap:
                    ascent["recommend"] = True

            ret[user_id]["ascents"].sort(key=sortByDate)

    return ret

def getJsonBoulderScorecardsFromLocal(user_ids):
    
    print("Starting 8a scrape")
    ret = {}

    print("  Getting ticklist(s) from local.....")
    for user_id in user_ids:
        print("    Getting {}s ticklist from local.....".format(user_id))
        with open("./raw-8a-json/{}.json".format(user_id), 'r') as f:
            ret[user_id] = json.load(f)

        for ascent in ret[user_id]["ascents"]:
            if climbKey(ascent) in recommendMap:
                ascent["recommend"] = True

        ret[user_id]["ascents"].sort(key=sortByDate)

    return ret

if __name__ == "__main__":
    parser = argparse.ArgumentParser( description='Pull json scorecards')
    parser.add_argument('sid', type=str, help='The Session ID Cookie to allow API access')
    parser.add_argument('user_ids', type=str, help='The user IDs you wish to scrape, separated by ","s no spaces')
    parser.add_argument('--out_dir', type=str, default='./',help='Destination folder. Filenames will be "user_id".json')
    parser.add_argument('--use_manual_json', type=bool, default=False, help='8a.nu APIs suck. a flag to just use manually saved JSON files')
    args = parser.parse_args()

    if (args.use_manual_json):
        scorecards = getJsonBoulderScorecardsFromLocal(args.user_ids.split(','))
    else:
        scorecards = getJsonBoulderScorecards(args.sid, args.user_ids.split(','))

    for user_id in scorecards:
        print("    Writing {}s ticklist to {}/{}.json".format(user_id, args.out_dir, user_id))
        with open(args.out_dir + "/" + user_id + '.json', 'w') as of:
            json.dump(scorecards[user_id], of, ensure_ascii=False, indent=4)

    print("...done")

