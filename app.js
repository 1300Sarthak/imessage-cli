var sqlite3 = require('sqlite3').verbose();
var fs = require("fs");
var dir = process.env.HOME + '/Library/Messages/';
var file = process.env.HOME + '/Library/Messages/chat.db';
var blessed = require("blessed");
var applescript = require("./applescript/lib/applescript.js");
var exec = require('child_process').exec;
var glob = require('glob');
var imessagemodule = require("imessagemodule");

// blessed elements
var chatList;
var selectedChatBox;
var inputBox;
var outputBox;

var exists = fs.existsSync(file);
if (!exists) {
	setTimeout(function() {
		outputBox.setItems(["Looks like there was a problem opening Messages.app's SQLite database.", "Open an issue at https://github.com/CamHenlin/imessageclient/issues"]);
		screen.render();
	}, 250);
}

// discover whether the keyboard setting "Full Keyboard Access" is set to
// "Text boxes and lists only" -- error or 1 or less
// "All controls" (takes 2 tabs instead of one switching between elements in Messages.app) -- 2 or more
var FULL_KEYBOARD_ACCESS = false; // false for text boxes and lists, true for all controls
exec('defaults read NSGlobalDomain AppleKeyboardUIMode', function(err, out, code) {
	if (err instanceof Error) {
		// return because we already have false set and error means text boxes and lists only
		return;
	}

	if (parseInt(out) > 1) {
		FULL_KEYBOARD_ACCESS = true;
	}
});

// make sure assistive access is set up
function assistiveAccessCheck() {
	// first check if assistive access is turned on
	applescript.execFile(__dirname+'/assistive.AppleScript', [true], function(err, result) {
		if (err) {
			try {
				outputBox.setItems(["This program requires OS X Assistive Access, which is currently disabled.", "Opening Assistive Access now... (You may be asked to enter your password.)", "note: to run locally, enable access to Terminal or iTerm2, to run over SSH, enable access to sshd_keygen_wrapper."]);
				screen.render();
				applescript.execFile(__dirname+'/assistive.AppleScript', [false], function(err, result) {});
			} catch (error) {
				// I believe this might happen with old versions of OS X
				console.log('if you are seeing this text, please file an issue at https://github.com/CamHenlin/imessageclient/issues including your OS X version number and any problems you are encountering.')
			}
		}
	});
};

// read the Messages.app sqlite db
var db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => {
	if (err) {
		console.error("\n\nERROR: Unable to open Messages database.");
		console.error("This is likely due to macOS Privacy restrictions.");
		console.error("Please grant 'Full Disk Access' to your Terminal/Cursor app:");
		console.error("System Settings -> Privacy & Security -> Full Disk Access\n");
		console.error("Detailed error:", err.message);
		process.exit(1);
	}
});

// Create a screen object and name it.
var screen = blessed.screen();
screen.title = 'iMessages';

// internally used variables
var LAST_SEEN_ID = 0;
var LAST_SEEN_CHAT_ID = 0;
var ID_MISMATCH = false;
var SELECTED_CHATTER = ""; // could be phone number or email address or groupchat id
var SELECTED_CHATTER_NAME = ""; // should be a firstname and lastname if selected chatter exists in addressbook
var GROUPCHAT_SELECTED = false;
var SELECTED_GROUP = ""; // stores actual group title
var MY_APPLE_ID = "";
var ENABLE_OTHER_SERVICES = false;
var sending = false;
var chatSet = false;

// blessed code
// Left Column: Conversations
chatList = blessed.list({
	parent: screen,
	width: '30%',
	height: '100%',
	top: '0',
	left: '0',
	align: 'left',
	fg: 'cyan',
	label: 'Conversations',
	border: {
		type: 'line'
	},
	selectedBg: 'green',
	mouse: true,
	keys: true
});

// Right Column: Header (Contact Name)
selectedChatBox = blessed.box({
	parent: screen,
	align: 'center',
	fg: 'white',
	height: '10%',
	width: '70%',
	top: '0',
	right: '0', // Right side
	border: {
		type: 'line'
	},
	content: "Select a conversation"
});

// Right Column: Chat History
outputBox = blessed.list({
	parent: screen,
	fg: 'cyan',
	height: '80%', // Takes up most of the right side
	width: '70%',
	top: '10%',    // Below header
	right: '0',
	border: {
		type: 'line'
	},
	mouse: true,
	keys: true
});

// Right Column: Input Box
inputBox = blessed.textbox({
	parent: screen,
	fg: 'white',
	height: '10%',
	width: '70%',
	bottom: '0',
	right: '0',
	label: 'Type Message (Enter to send)',
	border: {
		type: 'line'
	},
	inputOnFocus: false // Handle manually to prevent double input
});


// load initial chats list (delay to ensure screen is ready)
setTimeout(function() {
	getChats();
}, 100);

// make sure we have assistive access enabled
assistiveAccessCheck();

// Allow scrolling with the mousewheel (manually).
chatList.on('wheeldown', function() {
	chatList.down();
});

chatList.on('wheelup', function() {
	chatList.up();
});

outputBox.on('wheeldown', function() {
	outputBox.down();
});

outputBox.on('wheelup', function() {
	outputBox.up();
});

// q button quits
screen.key('q', function(ch, key) {
	return process.exit(0);
});

// e button sends enter to Messages.app
screen.key('e', function(ch, key) {
	applescript.execFile(__dirname + '/send_return.AppleScript', [], function(err, result) {
		if (err) {
			throw err;
		}

		screen.render();
	});
});

// tab button switches focus (consolidated)
/*
screen.key('tab', function(ch, key) {
	if (chatList.focused) {
		inputBox.focus();
	} else {
		chatList.focus();
	}

	screen.render();
});
*/

// r button enables other services
screen.key('r', function(ch, key) {
	if (ENABLE_OTHER_SERVICES) {
		ENABLE_OTHER_SERVICES = false;
	} else {
		ENABLE_OTHER_SERVICES = true;
	}

	getChats();
	screen.render();
});

// tab button switches focus (removed duplicate handler)
/*
screen.key('tab', function(ch, key) {
	if (chatList.focused) {
		inputBox.focus();
	} else {
		chatList.focus();
	}

	screen.render();
});
*/

// not 100% sure why this doesnt work, should scroll up conversation
screen.key(',', function(ch, key) {
	outputBox.up();
	screen.render();
});

// not 100% sure why this doesnt work, should scroll down conversation
screen.key('.', function(ch, key) {
	outputBox.down();
	screen.render();
});

// n creates a new conversation
screen.key('n', function(ch, key) {
	var newChatBox = blessed.textarea({
		parent: screen,
		// Possibly support:
		// align: 'center',
		fg: 'blue',
		height: '15%',
		border: {
			type: 'line'
		},
		width: '75%',
		top: '35%',
		left: '12.5%',
		label: "New Conversation - type in contact iMessage info and hit enter"
	});

	newChatBox.on('focus', function() {
		newChatBox.readInput(function(data) {});

		newChatBox.key('enter', function(ch, key) {
			var sendTo = newChatBox.getValue();
			newChatBox.detach();
			inputBox.focus();
			selectedChatBox.setContent(sendTo);
			SELECTED_CHATTER = sendTo;
			screen.render();
		});

		newChatBox.key('esc', function(ch, key) {
			newChatBox.detach();
			chatList.focus();
			screen.render();
		});

		newChatBox.key('tab', function(ch, key) {

		});
	});
	newChatBox.focus();

	screen.render();
})

// Helper to clean binary blobs
function cleanAttributedBody(blob) {
	if (!blob) return "";
	try {
		// Convert to string
		var str = blob.toString();
		
		// 1. Filter out non-printable chars (including replacement char U+FFFD)
		//    Replace with single space to prevent word merging
		var clean = str.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F\uFFFC\uFFFD]/g, " ");
		
		// 2. Remove known CoreData/NSKeyedArchiver keywords
		//    We remove them globally.
		var junkKeywords = [
			"NSMutableAttributedString", "NSAttributedString", 
			"NSDictionary", "NSMutableDictionary", "NSArray", "NSMutableArray", 
			"NSString", "NSMutableString", "NSData", "NSValue", 
			"NSColor", "NSParagraphStyle", "NSFont", "NSNumber", "NSObject", 
			"streamtyped", "v1", "unarchiver", "__kIMMessagePartAttributeName", "presenting",
			"objects", "classes"
		];
		
		// Remove these keywords (case insensitive)
		junkKeywords.forEach(function(kw) {
			// We don't use \b to ensure we catch them even if touching weird symbols
			var re = new RegExp(kw, "gi");
			clean = clean.replace(re, " ");
		});

		// 3. Aggressive Strip: "iI" followed by specific junk patterns marks the end.
		//    The patterns seen are "iI i *", "iI / i *", "iI <digits>"
		//    We truncate the string immediately at this point.
		//    Note: "iI" (lowercase i, uppercase I) is very rare in English, so safe-ish anchor.
		var endMarkerMatch = clean.match(/\s(iI|i)\s+([i\/\|\*]|\d+)/);
		if (endMarkerMatch && endMarkerMatch.index > 0) {
			clean = clean.substring(0, endMarkerMatch.index);
		}

		// 4. Remove specific junk patterns seen in screenshots if missed by truncation
		clean = clean.replace(/\s\+\s/g, " "); // standalone +
		clean = clean.replace(/\s@\s/g, " ");  // standalone @
		
		// Remove trailing " i *" or " i" or " *"
		clean = clean.replace(/\s+i\s+\*\s*$/, "");
		clean = clean.replace(/\s+\*\s*$/, "");

		// 5. Remove runs of question marks that are likely artifacts

		// 5. Remove runs of question marks that are likely artifacts (e.g. ?????)
		//    BUT be careful not to remove user ????. 
		//    The artifact ones usually appear with spaces like "?? ?? ?????"
		//    We'll leave this for now as step 1 handles U+FFFD, the screenshot '?' might be literal '?'
		//    Let's rely on the trimming to clean up edges.

		// 6. Collapse spaces
		clean = clean.replace(/\s+/g, " ");
		
		// 7. Trim special junk from start
		//    Often starts with spaces or punctuation that isn't normal
		clean = clean.replace(/^[\s\W_]+/, function(match) {
			// Keep normal starting punctuation like " or ' or (
			return match.replace(/[^\w\s"'(]/g, "");
		});

		// 8. Final Trim
		clean = clean.trim();

		// Filter out strings that are just punctuation or too short/noisy
		if (clean.length < 1 || !clean.match(/[a-z0-9]/i)) {
			// If it's just punctuation, it might be a valid message like "?", allow it if it's short
			if (clean.match(/^[?!.)(]+$/)) return clean;
			// Otherwise assume junk
			return "";
		}

		return clean;
	} catch (e) {
		return "[Binary Data]";
	}
}

// handler for input textbox focus
var inputBoxFocusHandler = function() {
	inputBox.readInput(function(data) {
		// Callback fired on Submit/Cancel usually, but we handle keys manually below
	});

	// Clear previous 'enter' listeners to avoid stacking
	inputBox.unkey('enter');
	
	inputBox.key('enter', function(ch, key) {
		if (SELECTED_CHATTER === "") {
			return;
		}

		var message = inputBox.getValue();
		if (message.trim().length > 0) {
			sendMessage(SELECTED_CHATTER, message);
			inputBox.setValue("");
			// Force a clear of the screen line to prevent visual artifacts
			inputBox.screen.render(); 
		}
		
		// Re-establish read loop if needed, but usually blessed handles this.
		// We just want to ensure we don't exit the input mode.
		inputBox.readInput(function(data){});
	});

	inputBox.unkey('tab');
	inputBox.key('tab', function(ch, key) {
		// Stop reading input when tabbing away
		// inputBox.stopInput(); // This might crash if not implemented in version
		chatList.focus();
		screen.render();
	});
};
inputBox.on('focus', inputBoxFocusHandler);

// allow TAB to toggle between list and input
screen.key('tab', function(ch, key) {
	if (chatList.focused) {
		inputBox.focus();
	} else {
		chatList.focus();
	}
	screen.render();
});

// handler for when a conversation is selected
chatList.on('select', function(item, index) {
	chatSet = true;
	
	// Retrieve the original ID from the global array using the index
	// Fallback to item content if index is out of bounds (shouldn't happen)
	var originalID = (CHAT_IDS && CHAT_IDS[index]) ? CHAT_IDS[index] : item.content;
	
	// we don't want to try to get the name of groupchats
	if (originalID.indexOf('-chat') > -1) {
		GROUPCHAT_SELECTED = true;
		// so group chats can be whatever the selection was
		selectedChatBox.setContent(item.content); // Use display name for header
	} else {
		GROUPCHAT_SELECTED = false;
		// Update header with the name
		selectedChatBox.setContent(item.content);
		screen.render();
	}

	SELECTED_CHATTER = originalID;

	// Automatically focus input box so user can type immediately
	inputBox.focus();

	// handle special case for chats:
	if (SELECTED_CHATTER.indexOf('-chat') > -1) {
		SELECTED_GROUP = SELECTED_CHATTER;
		SELECTED_CHATTER = 'chat'+SELECTED_CHATTER.split('-chat')[1];
	}
	getAllMessagesInCurrentChat();
	screen.render();
});

// Use simplified contact lookup
function getNameFromPhone(phone, callback) {
	if (!phone) {
		callback();
		return;
	}

	// Just take the last 7 digits or more if possible to search
	var cleanPhone = phone.replace(/\D/g, '');
	if (cleanPhone.length > 7) {
		cleanPhone = cleanPhone.substr(cleanPhone.length - 7);
	}
	// If no digits, just try the original string (might be email)
	if (cleanPhone.length === 0) {
		cleanPhone = phone;
	}

	glob(process.env.HOME + '/Library/Application\ Support/AddressBook/**/AddressBook-v22.abcddb', function (er, files) {
		if (er || !files || files.length === 0) {
			callback();
			return;
		}

		var found = false;
		var pending = files.length;
		
		files.forEach(function(file) {
			var db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, function(err) {
				if (err) {
					pending--;
					if (pending === 0 && !found) callback();
					return;
				}
			});

			db.serialize(function() {
				// Search for any number ending with these digits
				var SQL = 'SELECT ZABCDRECORD.ZFIRSTNAME, ZABCDRECORD.ZLASTNAME FROM ZABCDRECORD LEFT JOIN ZABCDPHONENUMBER ON ZABCDRECORD.Z_PK = ZABCDPHONENUMBER.ZOWNER WHERE ZABCDPHONENUMBER.ZFULLNUMBER LIKE "%' + cleanPhone + '"';
				
				// If it looks like an email
				if (phone.indexOf('@') > 0) {
					SQL = 'SELECT ZABCDRECORD.ZFIRSTNAME, ZABCDRECORD.ZLASTNAME FROM ZABCDRECORD LEFT JOIN ZABCDEMAILADDRESS ON ZABCDRECORD.Z_PK = ZABCDEMAILADDRESS.ZOWNER WHERE ZABCDEMAILADDRESS.ZADDRESS = "' + phone + '"';
				}

				db.all(SQL, function(err, rows) {
					if (!found && rows && rows.length > 0) {
						found = true;
						var r = rows[0];
						var name = (r.ZFIRSTNAME || "") + " " + (r.ZLASTNAME || "");
						callback(name.trim());
					}
					pending--;
					if (pending === 0 && !found) callback();
				});
			});
		});
	});
}

// Global array to store original chat identifiers
var CHAT_IDS = [];
var NAME_CACHE = {};

function getChats() {
	db.serialize(function() {
		var arr = [];
		var SQL = "SELECT DISTINCT message.date, handle.id, chat.chat_identifier, chat.display_name  FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.is_from_me = 0 AND message.service = 'iMessage' ORDER BY message.date DESC";

		if (ENABLE_OTHER_SERVICES) {
			SQL = SQL.replace("AND message.service = 'iMessage'", "");
		}

		db.all(SQL, function(err, rows) {
			if (err) throw err;
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				if (row.chat_identifier === null || row.chat_identifier === undefined) {
					if (row.id && arr.indexOf(row.id) < 0 && row.id !== "" && typeof(row.id) !== "undefined") {
						arr.push(String(row.id));
					}
				} else if (arr.indexOf(row.chat_identifier) < 0 && arr.indexOf((row.display_name || '')+'-'+row.chat_identifier) < 0) {
					if (row.chat_identifier && typeof row.chat_identifier === 'string' && row.chat_identifier.indexOf('chat') > -1) {
						if (row.display_name && row.display_name !== "" && typeof(row.display_name) !== "undefined") {
							arr.push(String(row.display_name+'-'+row.chat_identifier));
						}

					} else {
						if (row.chat_identifier && row.chat_identifier !== "" && typeof(row.chat_identifier) !== "undefined") {
							arr.push(String(row.chat_identifier));
						}
					}

				}
			}
			// Filter out any null/undefined values and ensure all items are strings
			arr = arr.filter(function(item) { return item != null && item !== undefined && item !== ''; }).map(String);
			
			// UPDATE GLOBAL CHAT IDS
			CHAT_IDS = arr.slice();

			if (chatList && screen) {
				// Use cached names if available
				var displayArr = arr.map(function(id) {
					return NAME_CACHE[id] || id;
				});
				
				chatList.setItems(displayArr.length > 0 ? displayArr : ['No conversations found']);
				screen.render();
				
				// Post-load: Resolve contact names for phone numbers in the list
				arr.forEach(function(item, index) {
					// Check if item is a phone number (simple check) or doesn't have letters
					// OR if we don't have it in cache yet
					if ((!item.match(/[a-zA-Z]/) || item.startsWith('+')) && !NAME_CACHE[item]) {
						getNameFromPhone(item, function(name) {
							if (name && name.length > 0) {
								NAME_CACHE[item] = name; // Update cache
								// Update the specific item in the list
								chatList.setItem(index, name);
								screen.render();
							}
						});
					}
				});
			}
		});
	});
}

function getAllMessagesInCurrentChat() {
	var SQL = "";
	if (GROUPCHAT_SELECTED) { // this is a group chat
		SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read, message.associated_message_type, message.item_type, message.group_action_type, message.is_audio_message, message.payload_data, message.attributedBody, attachment.filename, attachment.mime_type, attachment.transfer_name FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id LEFT OUTER JOIN message_attachment_join ON message_attachment_join.message_id = message.ROWID LEFT OUTER JOIN attachment ON attachment.ROWID = message_attachment_join.attachment_id WHERE message.service = 'iMessage' AND chat.chat_identifier = '"+SELECTED_CHATTER+"' ORDER BY message.date DESC LIMIT 500";
	} else { // this is one person
		SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read, message.associated_message_type, message.item_type, message.group_action_type, message.is_audio_message, message.payload_data, message.attributedBody, attachment.filename, attachment.mime_type, attachment.transfer_name FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id LEFT OUTER JOIN message_attachment_join ON message_attachment_join.message_id = message.ROWID LEFT OUTER JOIN attachment ON attachment.ROWID = message_attachment_join.attachment_id WHERE message.service = 'iMessage' AND handle.id = '"+SELECTED_CHATTER+"' ORDER BY message.date DESC LIMIT 500";
	}

	if (ENABLE_OTHER_SERVICES) {
		SQL = SQL.replace("message.service = 'iMessage' AND ", "");
	}

	db.serialize(function() {
		var arr = [];
		db.all(SQL, function(err, rows) {
			if (err) throw err;
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				LAST_SEEN_CHAT_ID = row.ROWID;
				
				// Determine Sender Name
				var sender = "me";
				if (!row.is_from_me) {
					if (row.id) {
						// Try cache first
						sender = NAME_CACHE[row.id] || String(row.id);
						// If we have an ID but it looks like a phone and not in cache, trigger lookup
						// (Logic similar to list)
						if ((!String(row.id).match(/[a-zA-Z]/) || String(row.id).startsWith('+')) && !NAME_CACHE[row.id]) {
							// We can't update validly in this loop without flickering, but we can trigger it
							// for next render
							getNameFromPhone(row.id, function(name) {
								if (name) NAME_CACHE[row.id] = name;
							});
						}
					} else {
						sender = "Unknown";
					}
				}
				
				var text = (row.text != null) ? String(row.text) : "";
				
				// Handle Reaction/Tapback messages
				if (row.associated_message_type > 0) {
					var reaction = "";
					switch(row.associated_message_type) {
						case 2000: reaction = "Loved"; break;
						case 2001: reaction = "Liked"; break;
						case 2002: reaction = "Disliked"; break;
						case 2003: reaction = "Laughed at"; break;
						case 2004: reaction = "Emphasized"; break;
						case 2005: reaction = "Questioned"; break;
						default: reaction = "Reacted to"; break;
					}
					text = "[" + reaction + " a message]";
				}
				
				// Handle System Messages (e.g. name changes)
				if (row.item_type > 0) {
					text = "[System Message/Update]";
				}

				// Handle Audio Messages
				if (row.is_audio_message) {
					text += " [Audio Message]";
				}

				// Handle Blank Messages with Payload (Apps, Rich Links)
				if (text === "" && !row.filename) {
					if (row.payload_data) {
						text = "[Rich Link / App Data]";
					} else if (row.attributedBody) {
						// Attempt to extract text from the blob
						var extracted = cleanAttributedBody(row.attributedBody);
						if (extracted && extracted.length > 0) {
							text = extracted;
						} else {
							text = "[Rich Text Message]"; 
						}
					} else {
						// Final debug fallback
						text = "[Empty Message]";
					}
				}

				// Add attachment info if present
	if (row.filename) {
		var attachmentName = row.transfer_name || row.filename;
		if (attachmentName.startsWith('~')) {
			attachmentName = attachmentName.replace(/^~/, process.env.HOME);
		}
		
		// iTerm2 Inline Image Protocol
		if (process.env.TERM_PROGRAM === 'iTerm.app') {
			try {
				var imgContent = fs.readFileSync(attachmentName).toString('base64');
				// OSC 1337 ; File = [arguments] : base-64 encoded file contents ^G
				// inline=1 is critical.
				var osc = '\u001B]1337;File=inline=1;width=auto;preserveAspectRatio=1:' + imgContent + '\u0007';
				text += "\n" + osc + "\n";
			} catch (e) {
				text += " [Image Error: " + e.message + "]";
			}
		} else {
			text += " [Attachment: " + attachmentName + "]";
		}
	}
				
				arr.push(sender + ": " + text);
				if (row.is_from_me) {
					MY_APPLE_ID = row.id;
				}
			}

			// Filter and ensure all items are valid strings
			arr = arr.filter(function(item) { return item != null && item !== undefined; }).map(String);
			if (outputBox && screen) {
				outputBox.setItems(arr.length > 0 ? arr.reverse() : ['No messages']);
				outputBox.select(Math.min(rows.length, arr.length));
				screen.render();
			}
		});
	});
}

function sendMessage(to, message) {
	if (sending) { return; }
	sending = true;

	var target = to;
	if (GROUPCHAT_SELECTED) {
		target = SELECTED_GROUP.split('-chat')[0];
		// If group chat, we need a different AppleScript logic or just send to the ID
		// Actually, sending to group chat via AppleScript usually requires 'send "msg" to chat id "id"'
		// But let's try the unified script for now.
		// NOTE: 'to' for group chat usually looks like 'chat12345...'
		// If 'to' is a phone number, it works.
	} 

	applescript.execFile(__dirname + '/applescript/send_message.applescript', [to, message], function(err, result) {
		if (err) {
			outputBox.addItem("Error sending message: " + err);
			screen.render();
		} else {
			// Optimistically append message or wait for refresh
			// refresh will happen via interval
		}
		sending = false;
	});
}

setInterval(function() {
	// don't do anything until the user has selected a chat
	if (chatSet) {
		db.serialize(function() {
			db.all("SELECT MAX(ROWID) AS max FROM message", function(err, rows) {
				if (rows) {
					var max = rows[0].max;
					if (max > LAST_SEEN_ID) {
						LAST_SEEN_ID = max;
						var ID_MISMATCH = true;
						getChats();
						getAllMessagesInCurrentChat();
					}
				}
			}.bind(this));
		}.bind(this));
	}
}, 250);


