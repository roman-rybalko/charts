#!/usr/bin/python3

import sys
import time
import json
import random

if len(sys.argv) < 2:
    print("USAGE: %s <src_file>" % sys.argv[0])
    exit()

src_file = sys.argv[1]
data = [{"columns":[], "types":{"x":"x"}, "names":{}, "colors":{}}]
tmp = {}
columns = []

f = open(src_file, "r");

for line in f:
    (date, name, value) = line.split(",")
    try:
        t = time.strptime(date, "%Y-%m-%d")
    except:
        continue
    ts = int(time.mktime(t) * 1000)
    chart_id = name.lower()
    chart_name = name
    data[0]["types"][chart_id] = "line"
    data[0]["names"][chart_id] = chart_name
    if chart_id not in data[0]["colors"]:
        data[0]["colors"][chart_id] = "#%0.6x" % random.getrandbits(24)
    if chart_id not in tmp:
        tmp[chart_id] = {}
    try:
        tmp[chart_id][ts] = float(value)
    except:
        tmp[chart_id][ts] = 0
    columns.append(ts)

columns = sorted(set(columns))
data[0]["columns"].append(["x"] + columns)

#import pdb
#pdb.set_trace()

for chart_id in tmp:
    values = []
    for i in columns:
        if i not in tmp[chart_id]:
            values.append(0)
        else:
            values.append(tmp[chart_id][i])
    data[0]["columns"].append([chart_id] + values)

print(json.dumps(data))
