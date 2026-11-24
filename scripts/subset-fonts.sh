#!/bin/sh
# Subsets the Geist variable fonts to the glyphs the app shows and the weights it uses.
# Usage: scripts/subset-fonts.sh <dir with Geist-Variable.woff2 and GeistMono-Variable.woff2> <python venv with fonttools and brotli>
set -eu
src=$1
venv=$2
out=$(dirname "$0")/../public/fonts
# Basic Latin, no-break space, middle dot, multiplication sign, en/em dash, curly quotes, ellipsis, minus, check mark.
unicodes="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+2212,U+2713"
for name in Geist GeistMono; do
  "$venv/bin/fonttools" varLib.instancer -q "$src/$name-Variable.woff2" wght=400:700 -o "$out/$name.tmp.ttf"
  "$venv/bin/pyftsubset" "$out/$name.tmp.ttf" --unicodes="$unicodes" --layout-features='kern,liga,calt,ss01,cv11,tnum' \
    --flavor=woff2 --output-file="$out/$name.woff2"
  rm "$out/$name.tmp.ttf"
done
ls -l "$out"
