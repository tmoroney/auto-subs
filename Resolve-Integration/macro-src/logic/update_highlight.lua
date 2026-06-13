					return function(comp, tool)
						-- Must update Highlight keyframes (if enabled)
						local isEnabled = tool:GetInput("HighlightEnabled") == 1
						if isEnabled then
    					    loadstring(tool:GetData("ApplyHighlight"))()(comp, tool)
						end
					end
