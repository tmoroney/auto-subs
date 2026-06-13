					return function(comp, tool)
						local isEnabled = tool:GetInput("HighlightEnabled") == 1
						local func = isEnabled
        					and tool:GetData("ApplyHighlight") 
        					or tool:GetData("RemoveHighlight")
    					loadstring(func)()(comp, tool)
					end
