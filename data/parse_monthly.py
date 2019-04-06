#!/usr/bin/python3

import sys
import time
import json

if len(sys.argv) < 5:
    print("USAGE: %s <src_file> <chart_id> <chart_name> <chart_color>" % sys.argv[0])
    exit()

src_file = sys.argv[1]
chart_id = sys.argv[2]
chart_name = sys.argv[3]
chart_color = sys.argv[4]
data = [{"columns":[], "types":{"x":"x",chart_id:"line"}, "names":{chart_id:chart_name}, "colors":{chart_id:chart_color}}]
tmp = {}

f = open(src_file, "r");

for line in f:
    (date, value) = line.split(",")
    try:
        t = time.strptime(date, "%Y-%m")
    except:
        continue
    ts = int(time.mktime(t) * 1000)
    tmp[ts] = float(value)

#import pdb
#pdb.set_trace()

columns = sorted(tmp.keys())
values = []
for i in columns:
    values.append(tmp[i])

data[0]["columns"] = [["x"] + columns, [chart_id] + values]

print(json.dumps(data))
