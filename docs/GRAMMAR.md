# Grammar

The whole Proschi syntax in EBNF, for tool builders and quick lookups. Each
statement takes one line, except a label whose JSON payload continues until
its brackets balance. Whitespace between tokens is ignored.

## Productions

```ebnf
document     = { line } ;
line         = [ statement ] [ comment ] newline ;

statement    = title | import | node | connection
             | group-open | system | usecase-open | par-open | alt-open | section-open | close
             | traffic | requirements | capacity | entity | decision | test | legend
             | direction | layout ;

title        = "title" , ( string | id ) , [ string ] ;   (* 2nd string: summary *)
import       = "import" , string ;                      (* a relative path, git: or https:// source *)
node         = id , { string | tech | team | position | replicas | color | tag | "critical" | rank } ;  (* 1st string: name, 2nd: description *)
connection   = ref , arrow , ref , [ tag ] , [ ":" , label ] ;
ref          = id | id , "." , id ;                      (* orders.api: an entry point; one token, no spaces *)
group-open   = "group" , id , [ string ] , [ tech ] , { position | color | tag | rank } , "{" ;
system       = "system" , id , { string | team | position | color | tag | rank } , "{" ,
               { "from" , string
               | "expose" , id , [ string ] , [ "->" , ( string | id ) ]
               | "capacity" , "{" , { stub-part } , "}" } , "}" ;   (* one line each *)
stub-part    = quantity | ( "p99" | "latency" | "availability" ) , quantity ;
direction    = "direction" , ( "down" | "right" | "up" | "left" ) ;   (* alone on its line *)
layout       = "layout" , "ordered" ;                   (* alone on its line *)
rank         = "rank" , ( digit , { digit } | "first" | "last" ) ;
legend       = "legend" , "{" , { id , [ string ] , { color-value | color | "dashed" | "dotted" } } , "}" ;
color        = "color" , ( color-value | hex ) ;
color-value  = "gray" | "blue" | "teal" | "green" | "yellow" | "orange" | "red" | "purple" | "pink" ;
hex          = "#" , hex-digit , hex-digit , hex-digit , [ hex-digit , hex-digit , hex-digit ] ;  (* only after "color" *)
tag          = "." , id ;                                (* one token, e.g. .planned *)
usecase-open = "usecase" , ( string | id ) , [ string ] , "{" ;
par-open     = "par" , "{" ;
alt-open     = "alt" , ( string | id ) , [ "when" , string ] , "{" ;
section-open = "section" , ( string | id ) , "{" ;     (* labels the steps in it *)
close        = "}" , [ alt-open ] ;

traffic      = "traffic" , "{" , { string , quantity , [ "mix" , share , { "," , share } ] } , "}" ;
share        = string , quantity ;                       (* "Cache hit" 90% *)
requirements = "requirements" , "{" , { requirement } , "}" ;
requirement  = percentile , [ string , [ "scenario" , string ] ] , "<" , quantity
             | "availability" , [ string ] , ">=" , quantity
             | "durable" , string
             | "survive" , ( "any" , "node" , "failure" | "failure" , "of" , selector )
             | "cost" , "<=" , quantity ;
percentile   = "p50" | "p90" | "p95" | "p99" | "p999" ;
capacity     = "capacity" , "{" , { id , { capacity-part } } , "}" ;
capacity-part = quantity | "reads" , quantity | "writes" , quantity | "shards" , integer | "size" , ( "S" | "M" | "L" )
             | "latency" , quantity | "availability" , quantity | "cost" , quantity
             | "durable" | "volatile" | "consistency" , ( "strong" | "eventual" )
             | "bandwidth" , quantity | "egress" , quantity | "timeout" , quantity ;
entity       = "entity" , id , [ "in" , id ] , [ string ] , "{" , { id , id , { flag } } , "}" ;
flag         = "key" | "index" | "unique" | "optional" ;
decision     = "decision" , string , ( "because" , string
             | "{" , { "because" , string | "rejected" , string , string } , "}" ) ;
test         = "test" , string , "{" , { assertion } , "}" ;
assertion    = string , [ "scenario" , string ] , ( "calls" , selector , [ ( "before" | "after" ) , selector ]
             | "every" , "scenario" , "calls" , selector | "never" , "calls" , selector
             | "never" , "waits" , "for" , selector
             | "writes" , selector , "before" , "responding" | "responds" , status )
             | string , "has" , "scenario" , string
             | string , "handles" , "failure" , "of" , selector
             | string , "starts" , "at" , selector
             | [ "in" , string ] , selector , [ "never" ] , "calls" , selector
             | "no" , "path" , "from" , selector , "to" , selector
             | selector , "has" , "replicas" , ">=" , integer ;
selector     = selector-atom , { "or" , selector-atom } ;
selector-atom = id | tech | "any" , kind | "any" , ( "strong" | "eventual" ) , "store" ;
kind         = "client" | "edge" | "cdn" | "loadbalancer" | "gateway" | "dns"
             | "service" | "function" | "cache" | "database" | "search" | "analytics"
             | "queue" | "broker" | "storage" | "external" | "other" ;
status       = digit , digit , digit | digit , "xx" ;     (* 201, 4xx *)

arrow        = "->" | "->>" | "-->" | "-x" ;
position     = "pos" , integer , "," , integer ;
replicas     = "x" , digit , { digit } ;               (* one token, e.g. x3 *)
quantity     = number , [ magnitude ] , [ unit ] ;     (* 50ms, 100k rps, 99.9% *)
number       = digit , { digit } , [ "." , digit , { digit } ] ;
magnitude    = "k" | "m" | "b" ;
unit         = "rps" | "rpm" | "rpd" | "ms" | "s" | "%" | "usd/month" | "MB/s" | "GB/s" | "usd/GB" ;
id           = ( letter | "_" ) , { letter | digit | "_" } ;
string       = '"' , { character - '"' | "\" , character } , '"' ;
tech         = "[" , { character - "]" } , "]" ;
team         = "@" , { letter | digit | "_" | "-" } ;
integer      = [ "-" ] , digit , { digit } ;
comment      = "#" , { character } ;            (* only where a token can start *)
label        = [ label-prefix , [ label-prefix ] ] , { character } ;  (* to end of line; see below *)
label-prefix = ( "x" , digit , { digit } | "~" , number , size-unit ) , whitespace ;  (* requests only *)
size-unit    = "B" | "KB" | "MB" | "GB" | "TB" ;
```

## Where each statement may appear


| Statement | Top level | In `group` | In `usecase` / `alt` / `section` | In `par` |
|---|---|---|---|---|
| `title` | ✓ | | | |
| `import` | ✓ | | | |
| node | ✓ | ✓ | | |
| `group` | ✓ | ✓ | | |
| `system` | ✓ | ✓ | | |
| `direction` | ✓ | ✓ | | |
| `layout ordered` | ✓ | | | |
| `legend` | ✓ | | | |
| connection (`a -> b`) | ✓ | ✓ | as a step | as a step |
| `usecase` | ✓ | | | |
| `par` | | | ✓ | |
| `alt` | | | ✓ | |
| `section` | | | ✓ | |
| `traffic`, `requirements`, `capacity`, `entity`, `decision`, `test` | ✓ | | | |

## Notes

- `-x` is only valid as a step.
- `section` is a keyword only as `section "Name" {` (or `section Name {`);
  elsewhere it is an ordinary id. See [Sections](USE-CASES.md#sections).
- A label is read as [Use case steps](USE-CASES.md#use-case-steps)
  describes: optional `x<N>` and `~<size>` prefixes on a request, an
  optional HTTP method and path, an optional `json`, `xml` or `text`
  payload, and on a response a leading status code.
- The grammar describes syntax only. The parser also checks meaning:
  duplicate ids, unknown tech stacks (a warning), responses without a
  matching request, steps between nodes the architecture does not connect,
  import cycles, missing files and files outside the project root, edges to
  a system's internal nodes, and unknown use cases, scenarios and nodes in
  the high-level design blocks. The language server and `proschi check`
  report these.

The [language reference](LANGUAGE.md) links to the page that explains each
statement.
