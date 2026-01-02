on run {targetHandle, messageContent}
	tell application "Messages"
		if targetHandle starts with "chat" then
			try
				send messageContent to chat id targetHandle
			on error
				-- Fallback: sometimes chat ID in DB doesn't match AppleScript ID exactly, 
				-- but usually it does for 'chat...' style IDs.
				return "Error: Could not send to chat " & targetHandle
			end try
		else
			try
				set targetService to 1st service whose service type = iMessage
				set targetBuddy to buddy targetHandle of targetService
				send messageContent to targetBuddy
			on error
				return "Error: Could not find buddy " & targetHandle
			end try
		end if
	end tell
end run