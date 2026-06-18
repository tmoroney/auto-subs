> **Source:** Converted snapshot of the *Fusion 8 Scripting Guide & Reference Manual* (PDF -> Markdown). It may be outdated or inaccurate. For the DaVinci Resolve scripting API the live `ResolveDocs` README is the source of truth; for real working usage prefer tested code. See `../../SKILL.md`.

## MailMessage

MailMessage
class MailMessage
Parent class: Object
Represents an email message.
Please note that if no explicit server settings are set with
the SetServer, SetLogin and SetPassword

methods, the default Preferences (Globals -&gt; Network -&gt; Server Settings ...) are used. If these are not set the recipient server is tried to be reached.

→ Python usage:

```python
mail = fusion.CreateMail()

mail.AddRecipients("vfx@studio.com, myself@studio.com")
mail.SetSubject("Render Completed")
mail.SetBody("The job completed.")

print(mail.SendTable())
status = mail.SendTable().values()
print(status[0]) # success boolean
if len(status) &gt; 1:
print(status[1]) # error message
)
→ Lua usage:

mail = fusion.CreateMail()

mail.AddRecipients("vfx@studio.com, myself@studio.com")
mail.SetSubject("Render Completed")
mail.SetBody("The job completed.")

ok,errmsg = mail:Send()
print(ok)
print(errmsg)
```

# Methods

MailMessage.AddAttachment(filename)

Attaches a filename to the body.

→ Parameters:
- filename (string) – filename

→ Returns: success
→ Return type: boolean

MailMessage.AddRecipients(addresses)
Note: This method is overloaded and has alternative parameters. See other definitions.
Adds a recipient to the To: list.

→ Parameters:
- addresses (string) – addresses

MailMessage.AddRecipients(addresses)
Note: This method is overloaded and has alternative parameters. See other definitions.
Adds a recipient to the To: list.

→ Parameters:
- addresses (table) – addresses

MailMessage.GetTable()
Returns the message in the form of a table.

→ Returns: msg
→ Return type: table

MailMessage.RemoveAllAttachments()
Removes all attachments from the message.

MailMessage.RemoveAllRecipients()
Removes all recipients from the To: field.

MailMessage.Send()
- Sends the message.
- Return the success as bool and the message.
- Note there is a SendTable method for Python.

→ Returns: success
→ Return type: boolean

MailMessage.SetBody(bodytext)
Sets the message body.

→ Parameters:
- bodytext (string) – bodytext

MailMessage.SetHTMLBody(bodyhtml)
Sets the message body using HTML.
→ Parameters:
bodyhtml (string) – bodyhtml

MailMessage.SetLogin(login)
Sets the login to use for authentication.
→ Parameters:
login (string) – login

MailMessage.SetPassword(password)
Sets the password to use for authentication.
→ Parameters:
password (string) – password

MailMessage.SetSender(sender)
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the From: field.
→ Parameters:
sender (string) – sender

MailMessage.SetSender(sender)
Note: This method is overloaded and has alternative parameters. See other definitions.
Sets the From: field.
→ Parameters:
sender (table) – sender

MailMessage.SetServer(servername)
Sets the outgoing mail server to use.
→ Parameters:
servername (string) – servername

MailMessage.SetSubject(subject)
Sets the Subject: field.
→ Parameters:
subject (string) – subject
