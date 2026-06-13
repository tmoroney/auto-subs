-- Ordered list of animation modules under animations/ (file name without .lua).
--
-- ORDER MATTERS: fade must come first so it is applied as the base opacity layer
-- before size (pop-in) and offset (slide-up) modifiers are added. To add a new
-- animation, drop a `<name>.lua` descriptor next to this file and add its name
-- to this list. Files prefixed with `_` (helpers) are never listed here.
return {
	"fade",
	"pop_in",
	"slide_up",
}
