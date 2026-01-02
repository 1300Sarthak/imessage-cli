on run argv
	if item 1 of argv = "true" then
		tell application "System Events"
			tell process "Messages"
				-- try to access a UI element to verify permissions
				get name of window 1
			end tell
		end tell
		return
	end if
	
	tell application "System Events"
		set UI_enabled to UI elements enabled
	end tell
	
	if not UI_enabled then
		tell me
			activate
			display dialog "This program requires macOS Accessibility Permissions." & return & return & "Please grant Accessibility access to your Terminal application in System Settings > Privacy & Security." buttons {"Open Settings", "OK"} default button 1 with icon 1
			if button returned of result is "Open Settings" then
				tell application "System Settings"
					activate
					-- Attempt to navigate to Privacy & Security (this is best effort in Ventura)
					reveal anchor "Privacy_Accessibility" of pane id "com.apple.preference.security"
				end tell
			end if
		end tell
	end if

end run