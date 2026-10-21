#!/bin/sh
# Print one version's section from CHANGELOG.md, without its heading,
# for pasting into a GitHub Release.
#
# Usage: scripts/release-notes.sh 0.7.0
#        scripts/release-notes.sh v0.7.0
#        scripts/release-notes.sh Unreleased
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <version>" >&2
  exit 2
fi

version=${1#v}
changelog="$(dirname "$0")/../CHANGELOG.md"

awk -v v="$version" '
  /^## \[/ {
    if (found) exit
    if (index($0, "## [" v "]") == 1) { found = 1; next }
  }
  /^\[[^]]+\]: / { if (found) exit }
  !found { next }
  NF == 0 { if (printed) blank++; next }
  { while (blank > 0) { print ""; blank-- }; print; printed = 1 }
  END {
    if (!found) { print "no section for " v " in CHANGELOG.md" > "/dev/stderr"; exit 1 }
  }
' "$changelog"
