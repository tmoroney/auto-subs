---@diagnostic disable: undefined-global
local target = composition or comp
local frame = tonumber(target:GetData("AutoSubsPreviewFrame"))
local success, result = pcall(function()
    return target:Render({
        Start = frame,
        End = frame,
        Wait = true,
        RenderFlags = 524288,
    })
end)
target:SetData("AutoSubsPreviewRenderStatus", success and result == true and "success" or "failed")
target:SetData("AutoSubsPreviewRenderError", success and "" or tostring(result))
