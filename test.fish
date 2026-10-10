#!/usr/bin/env fish
#
# Phase 4-8 acceptance checks for the Task API.
#
#   ./test.fish            run against http://localhost:8080
#   ./test.fish 3000       run against a different port
#
# Start the server in another terminal first. Each run creates its own task
# and cleans it up, so the checks do not depend on what is already stored.

set -l port 8080
test (count $argv) -ge 1; and set port $argv[1]
set -g BASE "http://localhost:$port"

set -g passed 0
set -g failed 0

# check <label> <expected> <actual>
function check
    if test "$argv[2]" = "$argv[3]"
        set -g passed (math $passed + 1)
        printf '  \033[32mPASS\033[0m  %-34s %s\n' "$argv[1]" "$argv[3]"
    else
        set -g failed (math $failed + 1)
        printf '  \033[31mFAIL\033[0m  %-34s got: %s\n' "$argv[1]" "$argv[3]"
        printf '        %-34s want: %s\n' "" "$argv[2]"
    end
end

# contains <label> <needle> <haystack>
function contains_check
    if string match -q "*$argv[2]*" -- "$argv[3]"
        set -g passed (math $passed + 1)
        printf '  \033[32mPASS\033[0m  %-34s contains %s\n' "$argv[1]" "$argv[2]"
    else
        set -g failed (math $failed + 1)
        printf '  \033[31mFAIL\033[0m  %-34s missing %s\n' "$argv[1]" "$argv[2]"
        printf '        %-34s body: %s\n' "" "$argv[3]"
    end
end

function code
    curl -s -o /dev/null -w '%{http_code}' -m 5 $argv
end

function body
    curl -s -m 5 $argv
end

# ---------------------------------------------------------------- reachable?
if not curl -s -o /dev/null -m 3 $BASE/health
    echo "server not answering on $BASE — start it with: cd backend && bun run start"
    exit 1
end

echo
echo "happy path"

check "GET /health" 200 (code $BASE/health)
check "  body" OK (body $BASE/health)

set -l created (body -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":"acceptance"}')
check "POST /tasks" 201 (code -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":"acceptance"}')
contains_check "  returns the task" '"title":"acceptance"' "$created"
contains_check "  status starts as todo" '"status":"todo"' "$created"
contains_check "  server assigned an id" '"id"' "$created"

set -l id (echo $created | string match -rg '"id":"([^"]+)"')
if test -z "$id"
    # POST did not hand back the task. It was still stored, so pick the id up
    # from the listing instead and keep going — the remaining checks are what
    # tell you whether the rest of the API works.
    set id (body $BASE/tasks | string match -rg '"id":"([^"]+)"' | tail -1)
    printf '  \033[33mNOTE\033[0m  POST gave no id back, took one from GET /tasks\n'
end
if test -z "$id"
    echo
    echo "no task id available — cannot run the remaining checks."
    exit 1
end

check "GET /tasks" 200 (code $BASE/tasks)
contains_check "  lists the new task" "$id" (body $BASE/tasks)

check "GET /tasks/{id}" 200 (code $BASE/tasks/$id)
contains_check "  returns the task" '"title":"acceptance"' (body $BASE/tasks/$id)

check "PATCH /tasks/{id}" 200 (code -X PATCH $BASE/tasks/$id -H 'content-type: application/json' -d '{"status":"done"}')
contains_check "  status changed" '"status":"done"' (body $BASE/tasks/$id)
contains_check "  title untouched" '"title":"acceptance"' (body $BASE/tasks/$id)

check "DELETE /tasks/{id}" 204 (code -X DELETE $BASE/tasks/$id)
check "  body is empty" "" (body -X DELETE $BASE/tasks/$id -o /dev/null)

echo
echo "error paths"

set -l gone (body $BASE/tasks/$id)
check "GET deleted task" 404 (code $BASE/tasks/$id)
contains_check "  error shape" '"error":"not_found"' "$gone"
contains_check "  has a message" '"message"' "$gone"
# -i because header names are case-insensitive: Bun writes "Content-Type".
check "  content-type is json" application/json (curl -s -i -m 5 $BASE/tasks/$id | string match -rgi 'content-type: ([^;\r]+)')

check "DELETE twice" 404 (code -X DELETE $BASE/tasks/$id)

set -l unknown (body $BASE/no-such-route)
check "GET unknown route" 404 (code $BASE/no-such-route)
contains_check "  error shape" '"error"' "$unknown"

check "POST malformed json" 400 (code -X POST $BASE/tasks -H 'content-type: application/json' -d '{')
check "POST missing title" 400 (code -X POST $BASE/tasks -H 'content-type: application/json' -d '{"description":"no title"}')

echo
echo "validation (phase 5)"

# 400 vs 422 is the point of this section: a body that will not parse is a 400,
# a body that parses but breaks a rule is a 422.
set -l too_long (string repeat -n 250 x)
set -l at_limit (string repeat -n 200 x)

set -l blank (body -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":""}')
check "POST empty title" 422 (code -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":""}')
contains_check "  says which field" title "$blank"
contains_check "  has a message" '"message"' "$blank"
check "  content-type is json" application/json (curl -s -i -m 5 -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":""}' | string match -rgi 'content-type: ([^;\r]+)')

check "POST 250-char title" 422 (code -X POST $BASE/tasks -H 'content-type: application/json' -d "{\"title\":\"$too_long\"}")

# 200 is the last accepted length, so it must still succeed. Clean it up after.
set -l edge (body -X POST $BASE/tasks -H 'content-type: application/json' -d "{\"title\":\"$at_limit\"}")
check "POST 200-char title" 201 (code -X POST $BASE/tasks -H 'content-type: application/json' -d "{\"title\":\"$at_limit\"}")
for stale in (echo $edge | string match -rg '"id":"([^"]+)"')
    curl -s -o /dev/null -m 5 -X DELETE $BASE/tasks/$stale
end

# PATCH goes through the same validation, so an empty title must fail there too.
set -l victim (body -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":"patch target"}')
set -l vid (echo $victim | string match -rg '"id":"([^"]+)"')
if test -n "$vid"
    check "PATCH empty title" 422 (code -X PATCH $BASE/tasks/$vid -H 'content-type: application/json' -d '{"title":""}')
    contains_check "  original survived" '"title":"patch target"' (body $BASE/tasks/$vid)
    curl -s -o /dev/null -m 5 -X DELETE $BASE/tasks/$vid
else
    printf '  \033[33mNOTE\033[0m  skipped PATCH validation checks (no id from POST)\n'
end

echo
echo "query params (phase 7)"

# Seed enough rows that paging has something to page through. Counts below are
# deliberately relative — they hold whatever else is already in the database.
set -l seeded
for i in (seq 1 25)
    set -l made (body -X POST $BASE/tasks -H 'content-type: application/json' -d "{\"title\":\"page-probe-$i\"}")
    set -a seeded (echo $made | string match -rg '"id":"([^"]+)"')
end
check "seeded 25 tasks" 25 (count $seeded)

# ids come back newest-first, so the most recently created is page 1 entry 1
set -l marked $seeded[-1]
curl -s -o /dev/null -m 5 -X PATCH $BASE/tasks/$marked -H 'content-type: application/json' -d '{"status":"done"}'

function ids
    body $argv | string match -rga '"id":"([^"]+)"'
end

check "default limit is 20" 20 (count (ids "$BASE/tasks"))
check "?limit=5 returns 5" 5 (count (ids "$BASE/tasks?limit=5"))
check "?limit=1 returns 1" 1 (count (ids "$BASE/tasks?limit=1"))

set -l page1 (ids "$BASE/tasks?limit=5&offset=0")
set -l page2 (ids "$BASE/tasks?limit=5&offset=5")
check "?offset pages forward" 5 (count $page2)

# No id may appear on both pages. That only holds if the query has an ORDER BY —
# without one the row order is undefined and paging silently duplicates rows.
set -l overlap 0
for one in $page1
    if contains -- $one $page2
        set overlap (math $overlap + 1)
    end
end
check "pages do not overlap" 0 $overlap

# Same request twice must come back in the same order. Join both into one string
# so the comparison is over the sequence, not a list-vs-string mismatch.
set -l again (ids "$BASE/tasks?limit=5&offset=0")
check "order is stable" (string join ',' $page1) (string join ',' $again)

set -l done_ids (ids "$BASE/tasks?status=done&limit=100")
if contains -- $marked $done_ids
    set -g passed (math $passed + 1)
    printf '  \033[32mPASS\033[0m  %-34s %s\n' "?status=done includes it" "found"
else
    set -g failed (math $failed + 1)
    printf '  \033[31mFAIL\033[0m  %-34s %s\n' "?status=done includes it" "the task marked done is missing"
end

set -l todo_ids (ids "$BASE/tasks?status=todo&limit=100")
if contains -- $marked $todo_ids
    set -g failed (math $failed + 1)
    printf '  \033[31mFAIL\033[0m  %-34s %s\n' "?status=todo excludes it" "a done task leaked into the todo filter"
else
    set -g passed (math $passed + 1)
    printf '  \033[32mPASS\033[0m  %-34s %s\n' "?status=todo excludes it" "filtered out"
end

check "?unknown=x is ignored" 200 (code "$BASE/tasks?unknown=x")
check "?status=bogus" 400 (code "$BASE/tasks?status=bogus")
check "?limit=abc" 400 (code "$BASE/tasks?limit=abc")
# PostgreSQL has no unsigned integers, so limit/offset are i64: -1 parses fine
# and is then refused by the range rule — a validation failure, hence 422.
check "?limit=-1" 422 (code "$BASE/tasks?limit=-1")
check "?offset=-1" 422 (code "$BASE/tasks?offset=-1")

echo
echo "query validation — needs ValidatedQuery<T>"

# These fail while list_tasks still takes a plain Query<T>: the #[validate]
# attributes on TaskQuery are never run, and rejections come back as plain text
# instead of the JSON error shape everything else uses.
set -l bogus (body "$BASE/tasks?status=bogus")
contains_check "  bogus status is json" '"error"' "$bogus"
check "?limit=0 is rejected" 422 (code "$BASE/tasks?limit=0")
check "?limit above the cap" 422 (code "$BASE/tasks?limit=9999")

for stale in $seeded
    curl -s -o /dev/null -m 5 -X DELETE $BASE/tasks/$stale
end

echo
echo "PATCH semantics — absent vs null (frontend)"

# A PATCH body can mean three different things for description:
#   key absent            -> leave it alone
#   "description": null   -> clear it
#   "description": "x"    -> set it to "x"
# The frontend's edit dialog sends null when the field is emptied, so the
# second case is how a user deletes a description. Option<String> cannot tell
# the first two apart; it takes Option<Option<String>> to do that.
set -l held (body -X POST $BASE/tasks -H 'content-type: application/json' -d '{"title":"patch probe","description":"keep me"}')
set -l pid (echo $held | string match -rg '"id":"([^"]+)"')

if test -n "$pid"
    curl -s -o /dev/null -m 5 -X PATCH $BASE/tasks/$pid -H 'content-type: application/json' -d '{"status":"done"}'
    contains_check "absent key leaves it alone" '"description":"keep me"' (body $BASE/tasks/$pid)

    curl -s -o /dev/null -m 5 -X PATCH $BASE/tasks/$pid -H 'content-type: application/json' -d '{"description":"replaced"}'
    contains_check "a string replaces it" '"description":"replaced"' (body $BASE/tasks/$pid)

    curl -s -o /dev/null -m 5 -X PATCH $BASE/tasks/$pid -H 'content-type: application/json' -d '{"description":null}'
    contains_check "null clears it" '"description":null' (body $BASE/tasks/$pid)

    # Clearing description must not disturb the fields that were not sent.
    contains_check "  title survived the clear" '"title":"patch probe"' (body $BASE/tasks/$pid)
    contains_check "  status survived the clear" '"status":"done"' (body $BASE/tasks/$pid)

    curl -s -o /dev/null -m 5 -X DELETE $BASE/tasks/$pid
else
    set -g failed (math $failed + 1)
    printf '  \033[31mFAIL\033[0m  %-34s %s\n' "PATCH semantics" "could not create the probe task"
end

echo
printf 'passed %d   failed %d\n\n' $passed $failed
test $failed -eq 0
