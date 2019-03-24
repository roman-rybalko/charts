#!/usr/bin/python3

import sys
import json

if len(sys.argv) < 2:
    print("USAGE: %s <src_file> <src_file> ..." % sys.argv[0])
    exit()

data = []

for src_file in sys.argv[1:]:
    f = open(src_file, "r");
    file_data = json.load(f)
    data += file_data

print(json.dumps(data))
