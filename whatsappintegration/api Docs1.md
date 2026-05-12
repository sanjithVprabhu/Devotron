Get Business Profile by Id
get
https://apis.aisensy.com/project-apis/v1/business/{business_id}
Get the details of business registered on AiSensy.

Request
Path Parameters
business_id
string
required
Responses
200
400
404
500
OK

Body

application/json

application/json
id
string
Business Id, used for uniquely identifying a business on AiSensy

active
boolean
Business owner has logged-in recently

display_name
string
Business owner name

project_ids
array[string]
List of all Project IDs created under business

user_name
string
Owner's login username

business_id
string
Business Id of the business

email
string
Owner's email

created_at
integer
Timestamp(millis) of creation date

updated_at
integer
Timestamp(millis) of last update date

company
string
Business Name

contact
string
Owner's phone number

currency
string
Business default billing currency

Allowed values:
INR
USD
timezone
string
Business default timezone

type
string
owner

Allowed values:
owner
manager
agent
X-AiSensy-Project-API-Pwd
:
123
business_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/business/{business_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "61f0624bcf0a58553378ceb4",
  "active": true,
  "display_name": "qwerty 1",
  "project_ids": [
    "61f06252cf0a58553378ceb5"
  ],
  "user_name": "ankitkumarguptapr2@gmail.com",
  "business_id": "61f0624bcf0a58553378ceb4",
  "email": "ankitkumarguptapr2@gmail.com",
  "created_at": 1643143755321,
  "updated_at": 1643143755321,
  "company": "Shop XY",
  "contact": "918116856134",
  "currency": "INR",
  "timezone": "Asia/Calcutta",
  "type": "owner"
}

Get Project by Id
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}
Get all details of a project on AiSensy.

Request
Path Parameters
project_id
string
required
Responses
200
404
500
OK

Body

application/json

application/json
responses
/
200
Businesses can create multiple projects. Each project can be linked with one WhatsApp Number. Billings/Subscription is managed at project level.

id
string
Project Id, used for uniquely identifying a project on AiSensy

name
string
Unique name of the project

business_id
string
Business-owner of the project

partner_id
string
Partner identifier

plan_activated_on
number
Timestamp(millis) of subscription cycle start date

status
string
Current status as per overdue : ACTIVE, PENDING, SUSPENDED, STOPPED, ARCHIVED

sandbox
boolean
WhastApp verification pending

active_plan
string
Current active plan

created_at
number
Timestamp(millis) of creation date

updated_at
number
Timestamp(millis) of last update date

plan_renewal_on
number
Timestamp(millis) of subscription cycle end date

scheduled_subscription_changes
string
Scheduled changes on subscription renewal

mau_quota
number
Total MAU Quota for month or year (As per plan)

mau_usage
number
Current MAU usage

credit
number
Total WCC credit (x10⁵)

wa_number
string
Registered WhatsApp number

wa_messaging_tier
string
Daily template messaging limit

wa_display_name_status
string
WhatsApp display name verification status

fb_business_manager_status
string
Facebook Business ID verification status

wa_display_name
string
WhatsApp display name

wa_quality_rating
string
Current template messaging quality rating

wa_about
string
WhatsApp about

wa_display_image
string
WhatsApp display image URL

wa_business_profile
object
WhatsApp business profile details

address
string
Business address

description
string
Business description

email
string
Business email

vertical
string
Business vertical

websites
array[string]
Business websites (maximum 2)

billing_currency
string
Project billing currency

timezone
string
Project timezone

X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "620a9b3051211d275085772c",
  "name": "MakeMyDay-Gurgaon",
  "project_owner_id": "620a9b3051211d275085772c",
  "partner_id": "620a9b3051211d275085772c",
  "plan_activated_on": 1646391138000,
  "status": "active",
  "sandbox": false,
  "active_plan": "basic_monthly_tier_1",
  "created_at": 1643746671197,
  "updated_at": 1648825230627,
  "plan_renewal_on": 1649069538000,
  "scheduled_subscription_changes": "string",
  "mau_quota": 2000,
  "mau_usage": 78,
  "credit": 55000000,
  "wa_number": "447458197537",
}

Send Message
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages
Request
Path Parameters
project_id
string
required
Body
application/jsonapplication/xmlmultipart/form-data

application/json
Send Message Payload

messaging_product
string
recipient_type
string
to
string
required
type
string
required
text
object
preview_url
boolean
body
string
image
object
link
string
document
object
link
string
caption
string
template
object
name
string
language
object
components
array[object]
Responses
200
OK

Body

application/json

application/json
responses
/
200
messaging_product
string
contacts
array[object]
input
string
wa_id
string
messages
array[object]
id
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "to": "917089379345",
  "type": "text",
  "recipient_type": "individual",
  "text": {
    "body": "sample query from user?"
  }
}
{
  "to": "917089379345",
  "type": "text",
  "recipient_type": "individual",
  "text": {
    "body": "sample query from user?"
  }
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "to": "917089379345",
  "type": "text",
  "recipient_type": "individual",
  "text": {
    "body": "sample query from user?"
  }
}'
{
  "messaging_product": "string",
  "contacts": [
    {
      "input": "string",
      "wa_id": "string"
    }
  ],
  "messages": [
    {
      "id": "string"
    }
  ]
}

Get Message Details
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages/{message_id}
Get details of a particular chat message.

Request
Path Parameters
message_id
string
required
project_id
string
required
Responses
200
404
OK

Body

application/json

application/json
responses
/
200
id
string
required
Message Id, used for uniquely identifying a Message on AiSensy

project_id
string
required
Project identifier

business_id
string
required
Business-owner of the project

type
string
required
Allowed value:
message
phone_number
string
required
WhatsApp number of the Contact

contact_id
string
required
Contact Id, used for uniquely identifying a Contact on AiSensy

status
string
required
Current status of message

Allowed values:
SENT
DELIVERED
READ
is_hsm
boolean
required
Message is of type template

sender
string
required
Source of message

Allowed values:
SYSTEM
AGENT
USER
API
campaign
null or object
Campain detail if message was sent via campaign

name
string
required
Unique name of the campaign

campaign_id
string
required
Campaign Id, used for uniquely identifying a campaign on AiSensy

sent_at
number or null
Timestamp(millis) of sent date

delivered_at
number or null
Timestamp(millis) of delivered date

read_at
number or null
Timestamp(millis) of read date

chatbot_response
object or null
Response from chatbot

query_text
string
Query text to Dialogflow server

intent
string
Response intent from Dialogflow server

message_type
string
required
Type of message body

Allowed values:
ROOM_MESSAGE
TEXT
IMAGE
VIDEO
FILE
AUDIO
STICKER
LOCATION
CONTACT
QUICK_REPLY_CARD
QUICK_REPLY
BUTTON_REPLY
LIST_REPLY
LIST_MESSAGE
message_content
Text | Quick Reply | Room MessageImage | Video | File | Audio | StickerLocation Message ContentCONTACTList Message ContentQuick Reply CardBUTTON_REPLYList Reply Message Content

any of: Text | Quick Reply | Room Message
text
string
required
Plain text message

message_price
integer
required
Credit deduction for the message

user_name
string
required
Name of the Contact

deductionType
string or null
Deduction type

Allowed values:
MAU
WC
mau_details
object or null
MAU detail if deductionType is MAU

session_period
number
required
Timestamp(millis) of the start date of current billing cycle

session_created_on
number
required
Timestamp(millis) of the deduction date

session_created_by
string
required
MAU deducted due to user or business

Allowed values:
USER
BUSINESS
current_plan
string
required
Current plan active on project

Allowed values:
BASIC_MONTHLY_TIER_1
BASIC_MONTHLY_TIER_2
BASIC_MONTHLY_TIER_3
BASIC_MONTHLY_TIER_4
BASIC_MONTHLY_TIER_5
BASIC_MONTHLY_TIER_6
BASIC_MONTHLY_TIER_7
BASIC_MONTHLY_TIER_8
BASIC_MONTHLY_TIER_9
BASIC_YEARLY_TIER_1
BASIC_YEARLY_TIER_2
BASIC_YEARLY_TIER_3
BASIC_YEARLY_TIER_4
whatsapp_conversation_details
null or object
WhatsApp Conversation detail if deductionType is WA

type
string
required
MAU deducted due to user or business

Allowed values:
USER
BUSINESS
expiresAt
number
required
Time of expiry of conversation

X-AiSensy-Project-API-Pwd
:
123
message_id*
:
string
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/messages/{message_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "type": "message",
  "id": "666c242e672bf60eb436be13",
  "meta_data": [],
  "project_id": "6337cc42be7532606c705fce",
  "phone_number": "918116856153",
  "contact_id": "656f4637c9373231243f0351",
  "campaign": null,
  "sender": "AGENT",
  "message_content": {
    "text": "TEST REPLY "
  },
  "message_type": "TEXT",
  "status": "READ",
  "is_HSM": false,
  "chatbot_response": null,
  "agent_id": "6337cc42be7532606c705fcd",
  "sent_at": 1718363181280,
  "delivered_at": 1718363183000,
  "read_at": 1718363261000,
  "failureResponse": null,
  "userName": "qwerty",
  "countryCode": "91",
  "submitted_message_id": "",
  "message_price": 0,
  "deductionType": "WC",
  "mau_details": null,
  "whatsapp_conversation_details": {
    "id": "a8415e69208143fa668010e837ed3f82",
    "type": "UTILITY"
  },
  "context": null,
  "messageId": "wamid.HBgMOTE4MTE2ODU2MTUzFQIAERgSMzMwRDVFQTM2QTkwQzA4RTJFAA=="
}

Get Webhook Details
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/webhook/{webhook_id}
Get webhook detail by ID corresponding to a specific Custom App.

Request
Path Parameters
project_id
string
required
webhook_id
string
required
Responses
200
404
500
OK

Body

application/json

application/json
id
string
Webhook Id, used for uniquely identifying a webhook on AiSensy

app_id
string
App ID

project_id
string
Project identifier

business_id
string
Business-owner of the project

topics
array[string]
List of topics webhook has subscribed for

webhook_url
string
Webhook URL

partner_id
string
Partner identifier

shared_secret
string
Shared secret for webhook event

created_at
integer
Timestamp(millis) of creation date

updated_at
integer
Timestamp(millis) of last update date

X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
webhook_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/webhook/{webhook_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "627adef5f2d93aba6fa649d7",
  "app_id": "627ac3ce1b6404b276b1acae",
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "topics": [
    "contact.created"
  ],
  "webhook_url": "https://trewq.com",
  "partner_id": "627a74d85b433da419a08066",
  "shared_secret": "8d008e6e505171aa6897d8c32d03b9cef336bbef07537002edd4bf6a685df572",
  "created_at": 1652219637153,
  "updated_at": 1652220659065
}

Delete Webhook Subscription
delete
https://apis.aisensy.com/project-apis/v1/project/{project_id}/webhook/{webhook_id}
Delete webhook subscription to stop listening notifications on your webhook endpoint.

Request
Path Parameters
project_id
string
required
webhook_id
string
required
Responses
200
500
OK

Body

application/json

application/json
status
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
webhook_id*
:
string
Send API Request

Project APIs
curl --request DELETE \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/webhook/{webhook_id} \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "status": "success"
}

List Webhooks
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/webhook
You can fetch all the webhook subscriptions specific to your Custom App.

Request
Path Parameters
project_id
string
required
Query Parameters
app_name
string
App name (exact name specified while creating webhook)

Responses
200
400
500
OK

Body

application/json

application/json
array of:
id
string
Webhook Id, used for uniquely identifying a webhook on AiSensy

app_id
string
App ID

project_id
string
Project identifier

business_id
string
Business-owner of the project

topics
array[string]
List of topics webhook has subscribed for

webhook_url
string
Webhook URL

partner_id
string
Partner identifier

shared_secret
string
Shared secret for webhook event

created_at
integer
Timestamp(millis) of creation date

updated_at
integer
Timestamp(millis) of last update date

X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
app_name
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/webhook \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
[
  {
    "id": "627adef5f2d93aba6fa649d7",
    "app_id": "627ac3ce1b6404b276b1acae",
    "project_id": "6245d025fcb7966c46294618",
    "project_owner_id": "61f0624bcf0a58553378ceb4",
    "topics": [
      "contact.created"
    ],
    "webhook_url": "https://trewq.com",
    "partner_id": "627a74d85b433da419a08066",
    "shared_secret": "8d008e6e505171aa6897d8c32d03b9cef336bbef07537002edd4bf6a685df572",
    "created_at": 1652219637153,
    "updated_at": 1652220659065
  }
]

Submit WhatsApp Template Message
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template
Submit WhatsApp template messages for approval. You can track the template message status updates through using Project Webhook.

Request
Path Parameters
project_id
string
required
Body

application/json

application/json
label
string
required
Template label

category
string
required
Template category

Allowed values:
TRANSACTIONAL
MARKETING
OTP
type
string
required
Template content type

Allowed values:
TEXT
IMAGE
VIDEO
FILE
LOCATION
CAROUSEL
ORDER_DETAILS
language
string
required
Language used in template

Allowed values:
"Afrikaans"
"Albanian"
"Arabic"
"Azerbaijani"
"Bengali"
"Bulgarian"
"Catalan"
"Chinese (CHN)"
"Chinese (HKG)"
"Chinese (TAI)"
"Croatian"
"Czech"
"Danish"
"Dutch"
"English"
"English (UK)"
"English (US)"
"Estonian"
"Filipino"
"Finnish"
"French"
"German"
"Greek"
"Gujarati"
"Hausa"
"Hebrew"
"Hindi"
"Hungarian"
"Indonesian"
"Irish"
"Italian"
"Japanese"
"Kannada"
"Kazakh"
"Korean"
"Lao"
"Latvian"
"Lithuanian"
"Macedonian"
"Malay"
"Malayalam"
"Marathi"
"Norwegian"
"Persian"
"Polish"
"Portuguese (BR)"
"Portuguese (POR)"
"Punjabi"
"Romanian"
"Russian"
"Serbian"
"Slovak"
"Slovenian"
"Spanish"
"Spanish (ARG)"
"Spanish (SPA)"
"Spanish (MEX)"
"Swahili"
"Swedish"
"Tamil"
"Telugu"
"Thai"
"Turkish"
"Ukrainian"
"Urdu"
"Uzbek"
"Vietnamese"
"Zulu"
name
string
required
Unique template name

text
string
required
Message with/without parmeters

sample_text
string
required
Message with replaced param if any

message_action_type
string
Interactive action type

Allowed values:
CTA
QuickReplies
All
call_to_action
array[object]
If message_action_type is CTA

type
string
Action type

Allowed values:
Phone Number
URL
button_value
string
Url or phone number as per type

Example:
https://image_link.com or 918116856153
button_title
string
Button title

Example:
"Go to site!" or "Call now!"
quick_replies
array[string]
If message_action_type is QuickReplies add list of preset replies

header_text
string
footer_text
string
carousel_cards
array[object]
components
array[object]
buttons
array[object]
limited_time_Offer
object
has_expiration
boolean
text
string
header_type
any
Allowed values:
TEXT
IMAGE
VIDEO
isClickTrackingEnabled
boolean
Enable click tracking for template

Default:
false
Responses
200
400
500
OK

Body

application/json

application/json
responses
/
200
id
string
Template Id, used for uniquely identifying a template on AiSensy

name
string
Unique template name

label
string
Template label

status
string
Current approval status

Allowed values:
PENDING
APPROVED
REJECTED
call_to_action
array[object]
List of interactive actions,

URL type button
Call type button
type
string
PHONE_NUMBER or URL

button_value
string
Link or phone number

button_title
string
Button text

quick_replies
array[string]
List of all preset replies (maximim 3)

type
string
TEXT, IMAGE, VIDEO or FILE

language
string
Template language

text
string
Body text with/without parameters

sample_text
string
Body text with replaced parameters if any

message_action_type
string
QuickReplies or CTA

total_parameters
number
Number of replaceable parameters in payload text

project_id
string
Project identifier

business_id
string
Business-owner of the project

created_at
number
Timestamp(millis) of creation date

updated_at
number
Timestamp(millis) of last update date

category
string
Template category

Allowed values:
TRANSACTIONAL
MARKETING
OTP
rejected_reason
string
Reason of rejection

footerText
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "label": "test label",
  "category": "AUTHENTICATION",
  "type": "FILE",
  "language": "Afrikaans",
  "name": "temp_name_1",
  "text": "test",
  "sample_text": "test",
  "message_action_type": "CTA",
  "call_to_action": [
    {
      "type": "Phone Number",
      "button_value": "918116856153",
      "button_title": "Call Now"
    },
    {
      "type": "URL",
      "button_value": "https://www.sss.com/{{1}}",
      "button_title": "Go to"
    }
  ],
  "quick_replies": null
}
{
  "label": "test label",
  "category": "AUTHENTICATION",
  "type": "FILE",
  "language": "Afrikaans",
  "name": "temp_name_1",
  "text": "test",
  "sample_text": "test",
  "message_action_type": "CTA",
  "call_to_action": [
    {
      "type": "Phone Number",
      "button_value": "918116856153",
      "button_title": "Call Now"
    },
    {
      "type": "URL",
      "button_value": "https://www.sss.com/{{1}}",
      "button_title": "Go to"
    }
  ],
  "quick_replies": null
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "label": "test label",
  "category": "AUTHENTICATION",
  "type": "FILE",
  "language": "Afrikaans",
  "name": "temp_name_1",
  "text": "test",
  "sample_text": "test",
  "message_action_type": "CTA",
  "call_to_action": [
    {
      "type": "Phone Number",
      "button_value": "918116856153",
      "button_title": "Call Now"
    },
    {
      "type": "URL",
      "button_value": "https://www.sss.com/{{1}}",
      "button_title": "Go to"
    }
  ],
  "quick_replies": null
}'
{
  "id": "6245d13e981c44a36a851429",
  "name": "qwerty1",
  "label": "Template",
  "status": "APPROVED",
  "call_to_action": [],
  "quick_replies": [
    "qwerty",
    "qwerty2"
  ],
  "type": "TEXT",
  "language": "English",
  "text": "Your verification code is {{1}}. | [qwerty] | [qwerty2]",
  "sample_text": "Your verification code is [123456].",
  "message_action_type": "QuickReplies",
  "total_parameters": 1,
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "created_at": 1648742718226,
  "updated_at": 1648742718226,
  "category": "AUTHENTICATION"
}
List WA Template Message
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template/
Get all template messages in a project

Request
Path Parameters
project_id
string
required
Query Parameters
after
string
Fetch records after this ID (exclusive)

before
string
Fetch records before this ID (exclusive)

limit
number
Number of templates to fetch

>= 1
<= 100
Default:
10
Responses
200
400
500
OK

Body

application/json

application/json
responses
/
200
array of:
id
string
Template Id, used for uniquely identifying a template on AiSensy

name
string
Unique template name

label
string
Template label

status
string
Current approval status

Allowed values:
PENDING
APPROVED
REJECTED
call_to_action
array[object]
List of interactive actions,

URL type button
Call type button
type
string
PHONE_NUMBER or URL

button_value
string
Link or phone number

button_title
string
Button text

quick_replies
array[string]
List of all preset replies (maximim 3)

type
string
TEXT, IMAGE, VIDEO or FILE

language
string
Template language

text
string
Body text with/without parameters

sample_text
string
Body text with replaced parameters if any

message_action_type
string
QuickReplies or CTA

total_parameters
number
Number of replaceable parameters in payload text

project_id
string
Project identifier

business_id
string
Business-owner of the project

created_at
number
Timestamp(millis) of creation date

updated_at
number
Timestamp(millis) of last update date

category
string
Template category

Allowed values:
TRANSACTIONAL
MARKETING
OTP
rejected_reason
string
Reason of rejection

footerText
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
after
:
string
before
:
string
limit
:
defaults to: 10
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template/ \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
[
  {
    "id": "6245d13e981c44a36a851429",
    "name": "qwerty1",
    "label": "Template",
    "status": "APPROVED",
    "call_to_action": [],
    "quick_replies": [
      "qwerty",
      "qwerty2"
    ],
    "type": "TEXT",
    "language": "English",
    "text": "Your verification code is {{1}}. | [qwerty] | [qwerty2]",
    "sample_text": "Your verification code is [123456].",
    "message_action_type": "QuickReplies",
    "total_parameters": 1,
    "project_id": "6245d025fcb7966c46294618",
    "project_owner_id": "61f0624bcf0a58553378ceb4",
    "created_at": 1648742718226,
    "updated_at": 1648742718226
  }
]

Get WA Template by Id
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template/{wa_template_id}
Get WhatsApp Template messagae by Id.

Request
Path Parameters
project_id
string
required
wa_template_id
string
required
Responses
200
404
500
OK

Body

application/json

application/json
responses
/
200
id
string
Template Id, used for uniquely identifying a template on AiSensy

name
string
Unique template name

label
string
Template label

status
string
Current approval status

Allowed values:
PENDING
APPROVED
REJECTED
call_to_action
array[object]
List of interactive actions,

URL type button
Call type button
type
string
PHONE_NUMBER or URL

button_value
string
Link or phone number

button_title
string
Button text

quick_replies
array[string]
List of all preset replies (maximim 3)

type
string
TEXT, IMAGE, VIDEO or FILE

language
string
Template language

text
string
Body text with/without parameters

sample_text
string
Body text with replaced parameters if any

message_action_type
string
QuickReplies or CTA

total_parameters
number
Number of replaceable parameters in payload text

project_id
string
Project identifier

business_id
string
Business-owner of the project

created_at
number
Timestamp(millis) of creation date

updated_at
number
Timestamp(millis) of last update date

category
string
Template category

Allowed values:
TRANSACTIONAL
MARKETING
OTP
rejected_reason
string
Reason of rejection

footerText
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
wa_template_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template/{wa_template_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "6245d13e981c44a36a851429",
  "name": "qwerty1",
  "label": "Template",
  "status": "APPROVED",
  "call_to_action": [],
  "quick_replies": [
    "qwerty",
    "qwerty2"
  ],
  "type": "TEXT",
  "language": "English",
  "text": "Your verification code is {{1}}. | [qwerty] | [qwerty2]",
  "sample_text": "Your verification code is [123456].",
  "message_action_type": "QuickReplies",
  "total_parameters": 1,
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "created_at": 1648742718226,
  "updated_at": 1648742718226,
  "category": "AUTHENTICATION"
}

Delete WA Template
delete
https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template/{wa_template_id}
Delete WhatsApp template message. Refer to WhatsApp policy regarding deleting template messages.

Request
Path Parameters
project_id
string
required
wa_template_id
string
required
Responses
200
404
500
OK

Body

application/json

application/json
status
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
wa_template_id*
:
string
Send API Request

Project APIs
curl --request DELETE \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/wa_template/{wa_template_id} \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "status": "success"
}

Create Contact
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact
Create a contact in your AiSensy Project. New contacts are automatically opted-in for WhatsApp Notifications.

Request
Path Parameters
project_id
string
required
Body

application/json

application/json
name
string
required
Name of contact

mobile_number
string
required
Mobile number with countrycode

Responses
200
400
409
500
OK

Body

application/json

application/json
responses
/
200
id
string
Contact Id, used for uniquely identifying a Contact on AiSensy

project_id
string
Project identifier

business_id
string
Business-owner of the project

is_closed
boolean or null
Closed status of a Chat. True value represents that the chat has been closed.

is_intervened
boolean
Intervened status of chat. Represents if the chat of the Contact has been intervened by any Agent.

is_requesting
boolean or null
Represents if the Contact needs Agent intervention. If your chatbot doesn't able to answer Contact's query then the Chat automatically goes to Requesting Queue.

last_active
integer
Timestamp(millis) of last message received from the Contact

phone_number
string
WhatsApp number of the Contact

name
string
Name of the Contact as on WhatsApp.

intervened_by
string or null
Id of the Agent who has intervened this chat

country_code
string
Country code of the Contact's WA number. It is used for Country specific WhatsApp billings.

created_at
integer
Timestamp(millis) of creation date

on_whatsapp
boolean
It represents that the Contact's phone number exists on WhatsApp or not

timezone
string
Timezone setting of Project

last_message
number
Timestamp(millis) of last message exchanged. It could have been sent by the Contact or the Business

first_message
object or null
First message tags helps you the first intent of your Contact's query. It is automaticaaly assigned if tag's first message get's matched with Contact's first message to your Business. You can assign tags with active First Message Setting.

id
string
Chat ID of first message

added_at
integer
Timestamp(millis) of the first message

tags
array[object]
Tags assigned to the Contact

id
string
Tag id

added_at
integer
Timestamp(millis) of the tag addition

added_by
string
Id of the Agent who assigned the tag.

attributes
object
User attributes

X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "name": "string",
  "mobile_number": "string"
}
{
  "name": "string",
  "mobile_number": "string"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "name": "string",
  "mobile_number": "string"
}'
{
  "id": "6245d0323767b2c6bd8a078e",
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "is_closed": false,
  "is_intervened": true,
  "is_requesting": null,
  "last_active": 1651498781000,
  "phone_number": "918116856153",
  "name": "qwerty",
  "intervened_by": "61f0624bcf0a58553378ceb4",
  "country_code": "91",
  "created_at": 1648742450639,
  "on_whatsapp": true,
  "timezone": "Asia/Calcutta",
  "first_message": {
    "id": "61f0624bcf0a58553378ceb4",
    "added_at": 1648742450639
  },
  "tags": [
    {
      "id": "62512ef73a40093ade948a07",
      "added_at": 1649488426000,
      "added_by": "61f0624bcf0a58553378ceb4"
    },
    {
      "id": "625130f4650ce32d59626d39",
      "added_at": 1649488432000,
      "added_by": "61f0624bcf0a58553378ceb4"
    }
  ],
  "attributes": {
    "qwerty": "hello"
  },
  "last_message": "2022-05-02T13:39:42.108Z"
}

Get Contact by Id
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact/{contact_id}
Get contact by contact id

Request
Path Parameters
contact_id
string
required
project_id
string
required
Responses
200
404
500
OK

Body

application/json

application/json
responses
/
200
id
string
Contact Id, used for uniquely identifying a Contact on AiSensy

project_id
string
Project identifier

business_id
string
Business-owner of the project

is_closed
boolean or null
Closed status of a Chat. True value represents that the chat has been closed.

is_intervened
boolean
Intervened status of chat. Represents if the chat of the Contact has been intervened by any Agent.

is_requesting
boolean or null
Represents if the Contact needs Agent intervention. If your chatbot doesn't able to answer Contact's query then the Chat automatically goes to Requesting Queue.

last_active
integer
Timestamp(millis) of last message received from the Contact

phone_number
string
WhatsApp number of the Contact

name
string
Name of the Contact as on WhatsApp.

intervened_by
string or null
Id of the Agent who has intervened this chat

country_code
string
Country code of the Contact's WA number. It is used for Country specific WhatsApp billings.

created_at
integer
Timestamp(millis) of creation date

on_whatsapp
boolean
It represents that the Contact's phone number exists on WhatsApp or not

timezone
string
Timezone setting of Project

last_message
number
Timestamp(millis) of last message exchanged. It could have been sent by the Contact or the Business

first_message
object or null
First message tags helps you the first intent of your Contact's query. It is automaticaaly assigned if tag's first message get's matched with Contact's first message to your Business. You can assign tags with active First Message Setting.

id
string
Chat ID of first message

added_at
integer
Timestamp(millis) of the first message

tags
array[object]
Tags assigned to the Contact

id
string
Tag id

added_at
integer
Timestamp(millis) of the tag addition

added_by
string
Id of the Agent who assigned the tag.

attributes
object
User attributes

X-AiSensy-Project-API-Pwd
:
123
contact_id*
:
string
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact/{contact_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "6245d0323767b2c6bd8a078e",
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "is_closed": false,
  "is_intervened": true,
  "is_requesting": null,
  "last_active": 1651498781000,
  "phone_number": "918116856153",
  "name": "qwerty",
  "intervened_by": "61f0624bcf0a58553378ceb4",
  "country_code": "91",
  "created_at": 1648742450639,
  "on_whatsapp": true,
  "timezone": "Asia/Calcutta",
  "first_message": {
    "id": "61f0624bcf0a58553378ceb4",
    "added_at": 1648742450639
  },
  "tags": [
    {
      "id": "62512ef73a40093ade948a07",
      "added_at": 1649488426000,
      "added_by": "61f0624bcf0a58553378ceb4"
    },
    {
      "id": "625130f4650ce32d59626d39",
      "added_at": 1649488432000,
      "added_by": "61f0624bcf0a58553378ceb4"
    }
  ],
  "attributes": {
    "qwerty": "hello"
  },
  "last_message": "2022-05-02T13:39:42.108Z"
}

Update Contact
patch
https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact/{contact_id}
You can update Name, Custom Attributes, Opt-in status, Block status

Request
Path Parameters
contact_id
string
required
project_id
string
required
Body

application/json

application/json
name
string
opted_in
boolean
blocked
boolean
attributes
object
sample_key_1
string
sample_key_2
string
sample_key_3
string
Responses
200
404
500
OK

Body

application/json

application/json
responses
/
200
id
string
Contact Id, used for uniquely identifying a Contact on AiSensy

project_id
string
Project identifier

business_id
string
Business-owner of the project

is_closed
boolean or null
Closed status of a Chat. True value represents that the chat has been closed.

is_intervened
boolean
Intervened status of chat. Represents if the chat of the Contact has been intervened by any Agent.

is_requesting
boolean or null
Represents if the Contact needs Agent intervention. If your chatbot doesn't able to answer Contact's query then the Chat automatically goes to Requesting Queue.

last_active
integer
Timestamp(millis) of last message received from the Contact

phone_number
string
WhatsApp number of the Contact

name
string
Name of the Contact as on WhatsApp.

intervened_by
string or null
Id of the Agent who has intervened this chat

country_code
string
Country code of the Contact's WA number. It is used for Country specific WhatsApp billings.

created_at
integer
Timestamp(millis) of creation date

on_whatsapp
boolean
It represents that the Contact's phone number exists on WhatsApp or not

timezone
string
Timezone setting of Project

last_message
number
Timestamp(millis) of last message exchanged. It could have been sent by the Contact or the Business

first_message
object or null
First message tags helps you the first intent of your Contact's query. It is automaticaaly assigned if tag's first message get's matched with Contact's first message to your Business. You can assign tags with active First Message Setting.

id
string
Chat ID of first message

added_at
integer
Timestamp(millis) of the first message

tags
array[object]
Tags assigned to the Contact

id
string
Tag id

added_at
integer
Timestamp(millis) of the tag addition

added_by
string
Id of the Agent who assigned the tag.

attributes
object
User attributes

X-AiSensy-Project-API-Pwd
:
123
contact_id*
:
string
project_id*
:
string
{
  "name": "Ankit Gupta",
  "opted_in": false,
  "blocked": true
}
{
  "name": "Ankit Gupta",
  "opted_in": false,
  "blocked": true
}
Send API Request

Project APIs
curl --request PATCH \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact/{contact_id} \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "name": "Ankit Gupta",
  "opted_in": false,
  "blocked": true
}'
{
  "id": "6245d0323767b2c6bd8a078e",
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "is_closed": false,
  "is_intervened": true,
  "is_requesting": null,
  "last_active": 1651498781000,
  "phone_number": "918116856153",
  "name": "qwerty",
  "intervened_by": "61f0624bcf0a58553378ceb4",
  "country_code": "91",
  "created_at": 1648742450639,
  "on_whatsapp": true,
  "timezone": "Asia/Calcutta",
  "first_message": {
    "id": "61f0624bcf0a58553378ceb4",
    "added_at": 1648742450639
  },
  "tags": [
    {
      "id": "62512ef73a40093ade948a07",
      "added_at": 1649488426000,
      "added_by": "61f0624bcf0a58553378ceb4"
    },
    {
      "id": "625130f4650ce32d59626d39",
      "added_at": 1649488432000,
      "added_by": "61f0624bcf0a58553378ceb4"
    }
  ],
  "attributes": {
    "qwerty": "hello"
  },
  "last_message": "2022-05-02T13:39:42.108Z"
}

Get Contact by Mobile Number
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact?action=FetchContact&mobile_number={contact_mobile_number}
You can fetch the Contact details by the contact's mobile number

Request
Path Parameters
contact_mobile_number
string
required
project_id
string
required
Query Parameters
action
string
required
FetchContact or ValidateContact

mobile_number
string
required
Mobile number with Country code

Responses
200
404
500
OK

Body

application/json

application/json
responses
/
200
id
string
Contact Id, used for uniquely identifying a Contact on AiSensy

project_id
string
Project identifier

business_id
string
Business-owner of the project

is_closed
boolean or null
Closed status of a Chat. True value represents that the chat has been closed.

is_intervened
boolean
Intervened status of chat. Represents if the chat of the Contact has been intervened by any Agent.

is_requesting
boolean or null
Represents if the Contact needs Agent intervention. If your chatbot doesn't able to answer Contact's query then the Chat automatically goes to Requesting Queue.

last_active
integer
Timestamp(millis) of last message received from the Contact

phone_number
string
WhatsApp number of the Contact

name
string
Name of the Contact as on WhatsApp.

intervened_by
string or null
Id of the Agent who has intervened this chat

country_code
string
Country code of the Contact's WA number. It is used for Country specific WhatsApp billings.

created_at
integer
Timestamp(millis) of creation date

on_whatsapp
boolean
It represents that the Contact's phone number exists on WhatsApp or not

timezone
string
Timezone setting of Project

last_message
number
Timestamp(millis) of last message exchanged. It could have been sent by the Contact or the Business

first_message
object or null
First message tags helps you the first intent of your Contact's query. It is automaticaaly assigned if tag's first message get's matched with Contact's first message to your Business. You can assign tags with active First Message Setting.

id
string
Chat ID of first message

added_at
integer
Timestamp(millis) of the first message

tags
array[object]
Tags assigned to the Contact

id
string
Tag id

added_at
integer
Timestamp(millis) of the tag addition

added_by
string
Id of the Agent who assigned the tag.

attributes
object
User attributes

X-AiSensy-Project-API-Pwd
:
123
contact_mobile_number*
:
string
project_id*
:
string
action*
:
string
mobile_number*
:
string
Send API Request

Project APIs
curl --request GET \
  --url 'https://apis.aisensy.com/project-apis/v1/project/{project_id}/contact?action=FetchContact&mobile_number=%7Bcontact_mobile_number%7D' \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "6245d0323767b2c6bd8a078e",
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "is_closed": false,
  "is_intervened": true,
  "is_requesting": null,
  "last_active": 1651498781000,
  "phone_number": "918116856153",
  "name": "qwerty",
  "intervened_by": "61f0624bcf0a58553378ceb4",
  "country_code": "91",
  "created_at": 1648742450639,
  "on_whatsapp": true,
  "timezone": "Asia/Calcutta",
  "first_message": {
    "id": "61f0624bcf0a58553378ceb4",
    "added_at": 1648742450639
  },
  "tags": [
    {
      "id": "62512ef73a40093ade948a07",
      "added_at": 1649488426000,
      "added_by": "61f0624bcf0a58553378ceb4"
    },
    {
      "id": "625130f4650ce32d59626d39",
      "added_at": 1649488432000,
      "added_by": "61f0624bcf0a58553378ceb4"
    }
  ],
  "attributes": {
    "qwerty": "hello"
  },
  "last_message": "2022-05-02T13:39:42.108Z"
}

Create API Campaign
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api
Create API campaign to send template messages to end-users & track the impact.

Request
Path Parameters
project_id
string
required
Body

application/json

application/json
template_name
string
required
Any approved template

campaign_name
string
required
Unique campaign name

Responses
200
400
500
OK

Body

application/json

application/json
responses
/
200
id
string
Campaign Id, used for uniquely identifying a campaign on AiSensy

name
string
Unique name of the campaign

type
string
Type of campaign : API or BROADCAST

Allowed values:
BROADCAST
API
audience_size
integer or null
Audience count for campaign

submitted
integer or null
Sent count for Campaign

project_id
string
Project identifier

business_id
string
Business-owner of the project

status
string
Current status of campaign API Campaign : LIVE | STOPPED | PAUSED Broadcast Campaign : SENDING | SENT | FAILED

Allowed values:
SENT
LIVE
SENDING
STOPPED
PAUSED
FAILED
message_type
string
Message type : TEMPLATE or REGULAR

Allowed values:
TEMPLATE
REGULAR
message_payload
object
Message payload details

template
WA Template
Examples:
{"id":"6245d13e981c44a36a851429","name":"qwerty1","label":"Template","status":"APPROVED","call_to_action":[],"quick_replies":["qwerty","qwerty2"],"type":"TEXT","language":"English","text":"Your verification code is {{1}}. | [qwerty] | [qwerty2]","sample_text":"Your verification code is [123456].","message_action_type":"QuickReplies","total_parameters":1,"project_id":"6245d025fcb7966c46294618","project_owner_id":"61f0624bcf0a58553378ceb4","created_at":1648742718226,"updated_at":1648742718226,"category":"AUTHENTICATION"}
{"id":"6245d141981c44a36a851449","name":"migration_cta","label":"Template","status":"REJECTED","call_to_action":[{"type":"URL","button_value":"https://a@b.com","button_title":"go to"},{"type":"Phone Number","button_value":"918116856153","button_title":"call"}],"quick_replies":[],"type":"TEXT","language":"Afrikaans","text":"hi | [call,918116856153] | [go to,https://a@b.com]","sample_text":"hi","message_action_type":"CTA","total_parameters":0,"project_id":"6245d025fcb7966c46294618","project_owner_id":"61f0624bcf0a58553378ceb4","created_at":1648742721356,"updated_at":1648742721356,"category":"MARKETING","rejected_reason":"Invalid Format"}
{"id":"6245d026fcb7966c46294619","name":"test_payment_captured","label":"Payment Captured","status":"REJECTED","call_to_action":[],"quick_replies":[],"type":"TEXT","language":"English","text":"Hi!\n\n{{1}} INR has been deducted from your account.","sample_text":"Hi!\n\n[400] INR has been deducted from your account.","message_action_type":"None","total_parameters":1,"project_id":"6245d025fcb7966c46294618","project_owner_id":"61f0624bcf0a58553378ceb4","created_at":1648742438637,"updated_at":1651816915449,"category":"TRANSACTIONAL","rejected_reason":"Invalid Format"}
parameters
array[string] or null
List of replaceable template parameter

media
object or null
Media detail if template is of type media

created_at
integer
Timestamp(millis) of creation date

updated_at
integer
Timestamp(millis) of last update date

X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "template_name": "videotemplate",
  "campaign_name": "sad"
}
{
  "template_name": "videotemplate",
  "campaign_name": "sad"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "template_name": "videotemplate",
  "campaign_name": "sad"
}'
{
  "id": "625aad630bc1632c131c508b",
  "name": "sad",
  "type": "BROADCAST",
  "audience_size": 1,
  "submitted": 1,
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "status": "SENT",
  "message_type": "TEMPLATE",
  "message_payload": {
    "template": {
      "id": "6245d140981c44a36a851443",
      "name": "videotemplate",
      "label": "Template",
      "status": "APPROVED",
      "call_to_action": [],
      "quick_replies": [],
      "type": "VIDEO",
      "language": "English",
      "text": "Your verification code is {{1}}",
      "sample_text": "Your verification code is [232323]",
      "message_action_type": "None",
      "total_parameters": 1,
      "project_id": "6245d025fcb7966c46294618",
      "project_owner_id": "61f0624bcf0a58553378ceb4",
      "created_at": 1648742720866,
      "updated_at": 1648742720866
    },
    "parameters": [
      "sa"
    ],
    "media": {
      "filename": "sa",
      "url": "https://aisensy-project-media-library-stg.s3.ap-south-1.amazonaws.com/VIDEO/621cecb642b2921c6d28fc8c/9113520_samplemp4file.mp4"
    }
  },
  "created_at": 1650109795722,
  "updated_at": 1650109816711
}

get-project-project_id-campaign-api
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api
Request
Path Parameters
project_id
string
required
Responses
200
400
500
OK

Body
application/jsonapplication/xmlmultipart/form-data

application/json
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api \
  --header 'Accept: application/json, application/xml, multipart/form-data, text/html' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "campaign": [
    {
      "id": "63a416eba4168f198c59767",
      "name": "orderFeedbackSettings",
      "type": "API",
      "project_id": "6245d025fcb7966c46y6y898w",
      "business_id": "61f0624bcf0a583465467utj",
      "status": "LIVE",
      "message_type": "TEMPLATE",
      "message_payload": {
        "template": {
          "id": "638465e6e5d1f45467t8gkojh",
          "assistant_name": "aisensy",
          "name": "feedbacks",
          "label": "Template",
          "status": "APPROVED",
          "call_to_action": [],
          "quick_replies": [
            "I'm Happy",
            "I'm very Happy",
            "Not satisfied"
          ],
          "type": "TEXT",
          "language": "English",
          "text": "Hello *{{1}}*",
          "sample_text": "Hello *[aisensy]*",
          "message_action_type": "QuickReplies",
          "total_parameters": 3,
             "project_id": "6245d025fcb7966c4687tt7g6",
          "business_id": "61f0624bcf0a585536768hgh",
          "created_at": 1669621222352,
          "updated_at": 1669621222352,
          "category": "MARKETING",
          "rejected_reason": ""
        },
        "parameters": null,
        "media": null
      },
      "created_at": 1671698155442,
      "updated_at": 1671698155442
    }
  ],
  "size": 1,
  "count": 10
}

Send API Campaign
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api/send
You can send WhatsApp template messages & track the performance through campaigns. Complete guide at: https://help.aisensy.com/en/articles/5358962-api-reference-docs

Request
Path Parameters
project_id
string
required
Body

application/json

application/json
template_params
array[string]
List of replaceable parameter

name
string
required
Contact's name

phone_number
string
required
Contact's phone number

media
object
media object for template of type media

url
string
Public URL of media

filename
string
Any file name for media

campaign_name
string
required
Name of campaign to send

source
string
Source of contact if any

attributes
object
Attribute values in object format

<any_key>
string
Any key with corresponding string value

default_country_code
string
Default country code to consider if not present in phone number

Allowed values:
1
7
20
27
30
31
32
33
34
36
39
40
41
43
44
45
46
47
48
49
51
52
54
55
56
57
58
60
61
62
63
64
65
66
77
81
82
84
86
90
91
92
94
95
211
212
213
216
218
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
248
250
251
253
254
255
256
257
258
260
261
262
263
264
265
266
267
268
269
290
291
297
298
299
345
350
351
352
353
354
355
356
358
359
370
371
372
373
374
375
376
377
378
379
381
382
385
386
387
389
420
421
423
500
501
502
503
504
505
506
507
508
509
537
590
591
593
594
595
596
597
598
599
670
672
673
674
675
676
677
678
679
680
681
682
683
685
686
687
688
689
690
691
692
852
853
855
856
880
886
960
961
962
965
966
967
968
970
971
972
973
974
975
976
977
992
993
994
995
996
998
1242
1246
1264
1268
1284
1340
1441
1473
1664
1670
1671
1684
1767
1787
1809
1868
1876
tags
array[string]
Tag to add, must be among one of already created tags

Responses
200
400
500
OK

Body

application/json

application/json
status
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "template_params": [
    "$Name"
  ],
  "name": "Ankit",
  "phone_number": "918116856153",
  "media": {
    "url": "https://ucarecdn.com/c0da7e72-51ce-4ebc-8144-839e636bf153/-/crop/1490x1252/112,115/-/preview/templatee-03-(2).png",
    "filename": "sample file name"
  },
  "campaign_name": "FB Ad signups",
  "source": "organic",
  "attributes": {
    "country": "India"
  },
  "default_country_code": "91",
  "tags": [
    "AUGUST_LEAD"
  ]
}
{
  "template_params": [
    "$Name"
  ],
  "name": "Ankit",
  "phone_number": "918116856153",
  "media": {
    "url": "https://ucarecdn.com/c0da7e72-51ce-4ebc-8144-839e636bf153/-/crop/1490x1252/112,115/-/preview/templatee-03-(2).png",
    "filename": "sample file name"
  },
  "campaign_name": "FB Ad signups",
  "source": "organic",
  "attributes": {
    "country": "India"
  },
  "default_country_code": "91",
  "tags": [
    "AUGUST_LEAD"
  ]
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api/send \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "template_params": [
    "$Name"
  ],
  "name": "Ankit",
  "phone_number": "918116856153",
  "media": {
    "url": "https://ucarecdn.com/c0da7e72-51ce-4ebc-8144-839e636bf153/-/crop/1490x1252/112,115/-/preview/templatee-03-(2).png",
    "filename": "sample file name"
  },
  "campaign_name": "FB Ad signups",
  "source": "organic",
  "attributes": {
    "country": "India"
  },
  "default_country_code": "91",
  "tags": [
    "AUGUST_LEAD"
  ]
}'
{
  "status": "success"
}

Get API Campaign details
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api/{campaign_id}
Request
Path Parameters
campaign_id
string
required
project_id
string
required
Responses
200
404
500
OK

Body

application/json

application/json
responses
/
200
id
string
Campaign Id, used for uniquely identifying a campaign on AiSensy

name
string
Unique name of the campaign

type
string
Type of campaign : API or BROADCAST

Allowed values:
BROADCAST
API
audience_size
integer or null
Audience count for campaign

submitted
integer or null
Sent count for Campaign

project_id
string
Project identifier

business_id
string
Business-owner of the project

status
string
Current status of campaign API Campaign : LIVE | STOPPED | PAUSED Broadcast Campaign : SENDING | SENT | FAILED

Allowed values:
SENT
LIVE
SENDING
STOPPED
PAUSED
FAILED
message_type
string
Message type : TEMPLATE or REGULAR

Allowed values:
TEMPLATE
REGULAR
message_payload
object
Message payload details

template
WA Template
Examples:
{"id":"6245d13e981c44a36a851429","name":"qwerty1","label":"Template","status":"APPROVED","call_to_action":[],"quick_replies":["qwerty","qwerty2"],"type":"TEXT","language":"English","text":"Your verification code is {{1}}. | [qwerty] | [qwerty2]","sample_text":"Your verification code is [123456].","message_action_type":"QuickReplies","total_parameters":1,"project_id":"6245d025fcb7966c46294618","project_owner_id":"61f0624bcf0a58553378ceb4","created_at":1648742718226,"updated_at":1648742718226,"category":"AUTHENTICATION"}
{"id":"6245d141981c44a36a851449","name":"migration_cta","label":"Template","status":"REJECTED","call_to_action":[{"type":"URL","button_value":"https://a@b.com","button_title":"go to"},{"type":"Phone Number","button_value":"918116856153","button_title":"call"}],"quick_replies":[],"type":"TEXT","language":"Afrikaans","text":"hi | [call,918116856153] | [go to,https://a@b.com]","sample_text":"hi","message_action_type":"CTA","total_parameters":0,"project_id":"6245d025fcb7966c46294618","project_owner_id":"61f0624bcf0a58553378ceb4","created_at":1648742721356,"updated_at":1648742721356,"category":"MARKETING","rejected_reason":"Invalid Format"}
{"id":"6245d026fcb7966c46294619","name":"test_payment_captured","label":"Payment Captured","status":"REJECTED","call_to_action":[],"quick_replies":[],"type":"TEXT","language":"English","text":"Hi!\n\n{{1}} INR has been deducted from your account.","sample_text":"Hi!\n\n[400] INR has been deducted from your account.","message_action_type":"None","total_parameters":1,"project_id":"6245d025fcb7966c46294618","project_owner_id":"61f0624bcf0a58553378ceb4","created_at":1648742438637,"updated_at":1651816915449,"category":"TRANSACTIONAL","rejected_reason":"Invalid Format"}
parameters
array[string] or null
List of replaceable template parameter

media
object or null
Media detail if template is of type media

created_at
integer
Timestamp(millis) of creation date

updated_at
integer
Timestamp(millis) of last update date

X-AiSensy-Project-API-Pwd
:
123
campaign_id*
:
string
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/api/{campaign_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "id": "625aad630bc1632c131c508b",
  "name": "sad",
  "type": "BROADCAST",
  "audience_size": 1,
  "submitted": 1,
  "project_id": "6245d025fcb7966c46294618",
  "project_owner_id": "61f0624bcf0a58553378ceb4",
  "status": "SENT",
  "message_type": "TEMPLATE",
  "message_payload": {
    "template": {
      "id": "6245d140981c44a36a851443",
      "name": "videotemplate",
      "label": "Template",
      "status": "APPROVED",
      "call_to_action": [],
      "quick_replies": [],
      "type": "VIDEO",
      "language": "English",
      "text": "Your verification code is {{1}}",
      "sample_text": "Your verification code is [232323]",
      "message_action_type": "None",
      "total_parameters": 1,
      "project_id": "6245d025fcb7966c46294618",
      "project_owner_id": "61f0624bcf0a58553378ceb4",
      "created_at": 1648742720866,
      "updated_at": 1648742720866
    },
    "parameters": [
      "sa"
    ],
    "media": {
      "filename": "sa",
      "url": "https://aisensy-project-media-library-stg.s3.ap-south-1.amazonaws.com/VIDEO/621cecb642b2921c6d28fc8c/9113520_samplemp4file.mp4"
    }
  },
  "created_at": 1650109795722,
  "updated_at": 1650109816711
}

Get Campaign Analytics
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/analytics/{campaign_id}
Get Audience

Request
Path Parameters
campaign_id
string
required
Campaign ID

project_id
string
required
Project ID

Body
application/jsonapplication/xml

application/json
startDate
string
endDate
string
Responses
200
400
500
Ok

Body

application/json

application/json
responses
/
200
chats
array[object]
_id
string
assistantId
string
campaignId
string
dayDate
string
acCount
integer
acCreditUsage
integer
acCreditUsageCountryWise
object
agentMessages
object
bicCount
integer
bicCreditUsage
integer
bicCreditUsageCountryWise
object
businessCreatedMacCount
integer
campaignMessages
object
chatbotMessages
object
clientId
string
closedChatCount
integer
deliveredChatcount
integer
engagementCount
integer
enqueuedChatCount
integer
failedChatCount
integer
intervenedChatCount
integer
macUsageCount
integer
mcCount
integer
mcCreditUsage
integer
mcCreditUsageCountryWise
object
readChatCount
integer
repliedToCampaignCount
integer
requestingChatCount
integer
scCount
integer
scCreditUsage
integer
scCreditUsageCountryWise
object
sentChatCount
integer
sessionMessagesCount
integer
templateCreditUsedCount
integer
templateCreditUsedCountryWise
object
templateMessagesCount
integer
timezone
string
ucCount
integer
ucCreditUsage
integer
ucCreditUsageCountryWise
object
uicCount
integer
uicCreditUsage
integer
uicCreditUsageCountryWise
object
uniqueUserCount
integer
uniqueVisitorCount
integer
userCreatedMacCount
integer
userMessages
object
X-AiSensy-Project-API-Pwd
:
123
campaign_id*
:
string
project_id*
:
string
{
  "startDate": "string",
  "endDate": "string"
}
{
  "startDate": "string",
  "endDate": "string"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/analytics/{campaign_id} \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "startDate": "string",
  "endDate": "string"
}'
{
  "chats": [
    {
      "_id": "648169ad295026433cf4c597",
      "assistantId": "63403f35464ac80eba8c839f",
      "campaignId": "648169796f013f0bb3f1f3c3",
      "dayDate": "2023-06-07T18:30:00.000Z",
      "acCount": 0,
      "acCreditUsage": 0,
      "acCreditUsageCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "agentMessages": {
        "media": 0,
        "mediaSizeInMB": 0,
        "messagePrice": 0,
        "text": 0,
        "total": 0
      },
      "bicCount": 0,
      "bicCreditUsage": 0,
      "bicCreditUsageCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "businessCreatedMacCount": 0,
      "campaignMessages": {
        "media": 0,
        "mediaSizeInMB": 0,
        "messagePrice": 0,
        "text": 1,
        "total": 1
      },
      "chatbotMessages": {
        "media": 0,
        "mediaSizeInMB": 0,
        "messagePrice": 0,
        "text": 0,
        "total": 0
      },
      "clientId": "63029c7285871851a4932f58",
      "closedChatCount": 0,
      "deliveredChatcount": 0,
      "engagementCount": 0,
      "enqueuedChatCount": 0,
      "failedChatCount": 1,
      "intervenedChatCount": 0,
      "macUsageCount": 0,
      "mcCount": 0,
      "mcCreditUsage": 0,
      "mcCreditUsageCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "readChatCount": 0,
      "repliedToCampaignCount": 0,
      "requestingChatCount": 0,
      "scCount": 0,
      "scCreditUsage": 0,
      "scCreditUsageCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "sentChatCount": 1,
      "sessionMessagesCount": 0,
      "templateCreditUsedCount": 0,
      "templateCreditUsedCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "templateMessagesCount": 1,
      "timezone": "Asia/Calcutta GMT+05:30",
      "ucCount": 0,
      "ucCreditUsage": 0,
      "ucCreditUsageCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "uicCount": 0,
      "uicCreditUsage": 0,
      "uicCreditUsageCountryWise": {
        "OTHERS": {
          "amount": 0,
          "count": 0
        }
      },
      "uniqueUserCount": 0,
      "uniqueVisitorCount": 0,
      "userCreatedMacCount": 0,
      "userMessages": {

          "media": 0,
        "mediaSizeInMB": 0,
        "messagePrice": 0,
        "text": 0,
        "total": 0
      }
    }
  ]
}

Get Campaign Audience
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/audience/{campaign_id}
Returns the list of audience for the specified campaign.

Request
Path Parameters
campaign_id
string
required
Campaign ID

project_id
string
required
Project ID

Query Parameters
after
string
Get next set of results. After token value can be obtain from response.paging

before
string
Get previous set of results. Before token value can be obtained from response.paging

category
string
Category to be selected for filtering.

Allowed values:
SENT
DELIVERED
READ
FAILED
REPLIED
CLICKED
endDate
string
Ending date to get audience from in ISO Date Format.

fields
string
Fields to be selected. Fields must be separated by a comma.

limit
string
Range of audience to get in one set of request. Default value is 20. Max Value is 1000.

sort
string
Sort the audience on the basis of category.

Allowed values:
asc
desc
Default:
asc
startDate
string
Starting Date to get audience from in ISO Date Format.

Responses
200
OK

Body

application/json

application/json
total
integer
Size of the data recieved

data
array[object]
Audience list

_id
string
userNumber
string
Phone Number of the contact

sentAt
string
Message sent date

deliveredAt
string
Message delivered date

readAt
string
Message read date

userName
string
Name of the contact

paging
object
cursors
object
X-AiSensy-Project-API-Pwd
:
123
campaign_id*
:
string
project_id*
:
string
after
:
string
before
:
string
category
:
Not SetSENTDELIVEREDREADFAILEDREPLIEDCLICKED

select an option
endDate
:
string
fields
:
string
limit
:
string
sort
:
Not Setascdesc

select an option (defaults to: asc)
startDate
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaign/audience/{campaign_id} \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "total": 2,
  "data": [
    {
      "_id": "629f8041b45cc338a0a082bc",
      "userNumber": "919498526285",
      "sentAt": "2022-06-07T16:43:41.331Z",
      "userName": "Ajay Rathore"
    },
    {
      "_id": "629f8041b45cc338a0a08130",
      "userNumber": "919149327854",
      "sentAt": "2022-06-07T16:43:41.332Z",
      "userName": "Mohit"
    },
    {
      "_id": "629f8041b45cc338a0a0824d",
      "userNumber": "919020397439",
      "sentAt": "2022-06-07T16:43:41.332Z",
      "userName": "Mohit"
    }
  ],
  "paging": {
    "cursors": {
      "after": "NjI5ZjgwNDJiNDVjYzMzOGEwYTA4NDFmXzE2NTQ2MjAyMjEzMzI=",
      "before": "NjI5ZjgwNDFiNDVjYzMzOGEwYTA4MmJjXzE2NTQ2MjAyMjEzMzE="
    }
  }
}

Get Campaigns
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaigns
Request
Path Parameters
project_id
string
required
Project ID

Body
application/jsonapplication/xml

application/json
skip
integer
limit
integer
campaignType
string
required
Responses
200
400
500
Ok

Body

application/json

application/json
campaigns
array[object]
id
string
name
string
type
string
audience_size
integer
submitted
integer
project_id
string
business_id
string
status
string
message_type
string
message_payload
object
created_at
integer
updated_at
integer
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "skip": 0,
  "limit": 0,
  "campaignType": "API"
}
{
  "skip": 0,
  "limit": 0,
  "campaignType": "API"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/campaigns \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "skip": 0,
  "limit": 0,
  "campaignType": "API"
}'
{
  "campaigns": [
    {
      "id": "64899c7374263a67fea0b330",
      "name": "testing new aisensy campaign",
      "type": "BROADCAST",
      "audience_size": 1,
      "submitted": 1,
      "project_id": "63403f35464ac80eba8c839f",
      "business_id": "63029c7285871851a4932f58",
      "status": "SENT",
      "message_type": "TEMPLATE",
      "message_payload": {
        "template": {
          "id": "63459d0b1e151b32ee1007d2",
          "assistant_name": "dev_testing",
          "name": "invoice_created",
          "label": "invoice_created",
          "status": "APPROVED",
          "call_to_action": [
            {
              "type": "URL",
              "button_value": "https://rzp.io/{{2}}",
              "button_title": "Pay Now"
            }
          ],
          "quick_replies": [],
          "type": "TEXT",
          "language": "English",
          "text": "Hi!\n\nWe have raised an invoice of {{1}}. Kindly process the payment and clear the invoice by clicking on the button below.\n\nThank You,\nTeam AiSensy | [Pay Now,https://rzp.io/{{2}}]",
          "sample_text": "Hi!\n\nWe have raised an invoice of [₹999]. Kindly process the payment and clear the invoice by clicking on the button below.\n\nThank You,\nTeam AiSensy",
          "message_action_type": "CTA",
          "total_parameters": 2,
          "project_id": "63403f35464ac80eba8c839f",
          "business_id": "63029c7285871851a4932f58",
          "created_at": 1665506571987,
          "updated_at": 1686201908954,
          "partner_id": null,
          "category": "UTILITY",
          "rejected_reason": "NONE"
        },
        "parameters": [
          "test",
          "test2"
        ],
        "media": null
      },
      "created_at": 1686740083578,
      "updated_at": 1686740093667
    }
  ]
}

Create catalgoue
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/create-catalog
Create a new product catalog. Represents a catalog for your business you can use to deliver ads with dynamic ads.

Request
Path Parameters
project_id
string
required
Body
application/jsonapplication/xml

application/json
vertical
string
The type of catalog. Supported values: adoptable_pets, automotive_models, avatar, bookable, commerce, destinations, flights, home_listings, hotels, jobs, local_delivery_shipping_profiles, local_service_businesses, location_based_items, media_titles, offer_items, offline_commerce, test_vertical, ticketed_experiences, transactable_items, vehicle_offers, vehicles

name
string
required
The name of a catalog given by the creator

product_count
integer
The total number of products in a catalog

feed_count
integer
The total number of feeds used by a catalog

default_image_url
string
The URL for the default image, which is used for products without images, or when the product image is temporarily unavailable. If a product image matches the default image, this should be treated as if the image was not loaded

fallback_image_url
array[string]
The URL for the fallback image. This is used as the image for auto-generated dynamic items

is_catalog_segment
boolean
Verify that you will create ads based on a catalog or catalog segment before you try to create Dynamic Ads. Call this field and determine value otherwise you may get and error when you try to create Dynamic Ads from catalog segments.

da_display_settings
object
Image display settings such as background cropping and padding of items in the catalog for different Dynamic Ad format

carousel_ad
object
Dynamic Ad display settings that would be applied to carousel ads

single_ad
object
Dynamic Ad display settings that would be applied to single item ads.

Responses
200
Body

application/json

application/json
success
boolean
catalogue
object
status
boolean
isActive
boolean
isDeleted
boolean
_id
string
assistantId
string
metaBusinessAccountId
string
catalogueId
string
catalogueName
string
productCount
integer
feedCount
integer
vertical
string
clientId
string
createdAt
string
updatedAt
string
__v
integer
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "vertical": "commerce",
  "name": "my-new-catalogue8",
  "product_count": 10,
  "feed_count": 1,
  "default_image_url": "https://images.unsplash.com/photo-1600716051809-e997e11a5d52?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2050&q=80",
  "fallback_image_url": [
    "https://images.unsplash.com/photo-1558393385-c2019c6a125c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2832&q=80"
  ],
  "is_catalog_segment": false,
  "da_display_settings": {
    "carousel_ad": {
      "transformation_type": "none"
    },
    "single_ad": {
      "transformation_type": "none"
    }
  }
}
{
  "vertical": "commerce",
  "name": "my-new-catalogue8",
  "product_count": 10,
  "feed_count": 1,
  "default_image_url": "https://images.unsplash.com/photo-1600716051809-e997e11a5d52?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2050&q=80",
  "fallback_image_url": [
    "https://images.unsplash.com/photo-1558393385-c2019c6a125c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2832&q=80"
  ],
  "is_catalog_segment": false,
  "da_display_settings": {
    "carousel_ad": {
      "transformation_type": "none"
    },
    "single_ad": {
      "transformation_type": "none"
    }
  }
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/create-catalog \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "vertical": "commerce",
  "name": "my-new-catalogue8",
  "product_count": 10,
  "feed_count": 1,
  "default_image_url": "https://images.unsplash.com/photo-1600716051809-e997e11a5d52?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2050&q=80",
  "fallback_image_url": [
    "https://images.unsplash.com/photo-1558393385-c2019c6a125c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=2832&q=80"
  ],
  "is_catalog_segment": false,
  "da_display_settings": {
    "carousel_ad": {
      "transformation_type": "none"
    },
    "single_ad": {
      "transformation_type": "none"
    }
  }
}'
{
  "success": true,
  "catalogue": {
    "status": true,
    "isActive": true,
    "isDeleted": true,
    "_id": "string",
    "assistantId": "string",
    "metaBusinessAccountId": "string",
    "catalogueId": "string",
    "catalogueName": "string",
    "productCount": 0,
    "feedCount": 0,
    "vertical": "string",
    "clientId": "string",
    "createdAt": "string",
    "updatedAt": "string",
    "__v": 0
  }
}

Get catalogue
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/get-catalog
Returns a list of product catalogs. Product catalogs contain a list of items like products, hotels or flights, and the information needed to display them in dynamic ads.

Request
Path Parameters
project_id
string
required
Query Parameters
limit
number
Default value is 20

productCount
number
It will filter product on the basis of there product count

skip
number
Default value is 0

Responses
200
Body

application/json

application/json
catalogues
array[object]
_id
string
assistantId
string
catalogueId
string
metaBusinessAccountId
string
catalogueName
string
clientId
string
createdAt
string
defaultImageUrl
string
feedCount
integer
isActive
boolean
isDeleted
boolean
productCount
integer
status
boolean
updatedAt
string
vertical
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
limit
:
number
productCount
:
number
skip
:
number
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/get-catalog \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "catalogues": [
    {
      "_id": "string",
      "assistantId": "string",
      "catalogueId": "string",
      "metaBusinessAccountId": "string",
      "catalogueName": "string",
      "clientId": "string",
      "createdAt": "string",
      "defaultImageUrl": "string",
      "feedCount": 0,
      "isActive": true,
      "isDeleted": true,
      "productCount": 0,
      "status": true,
      "updatedAt": "string",
      "vertical": "string"
    }
  ]
}

Sync catalogue
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/sync-catalog
It will sync your business account catalogue data

Request
Path Parameters
project_id
string
required
Responses
200
Body

application/json

application/json
status
boolean
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/sync-catalog \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "status": true
}

Connect meta catalogue
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/connect-meta-catalog
You can connect your any catalogue under your business account to your whatsapp waba

Request
Path Parameters
project_id
string
required
Body

application/json

application/json
catalogueId
string
required
Catalogue ID which you want to connect from your WABA

Responses
200
201
OK

Body

application/json

application/json
status
boolean
Default:
true
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "catalogueId": "6591548274202717"
}
{
  "catalogueId": "6591548274202717"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/connect-meta-catalog \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "catalogueId": "6591548274202717"
}'
{
  "status": true
}

Disconnect meta catalogue
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/disconnect-meta-catalog
You can disconnect your any catalogue under your business account to your whatsapp WABA

Request
Path Parameters
project_id
string
required
Body
application/jsonapplication/xml

application/json
catalogueId
string
required
Catalogue ID which you want to disconnect from your WABA

Responses
200
OK

Body

application/json

application/json
status
boolean
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "catalogueId": "6591548274202717"
}
{
  "catalogueId": "6591548274202717"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/disconnect-meta-catalog \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "catalogueId": "6591548274202717"
}'
{
  "status": true
}

Create catalgoue product
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/create-product
You can create or add product to your any catalogue

Request
Path Parameters
project_id
string
required
Body
application/jsonapplication/xml

application/json
For additional fields and information refer to https://developers.facebook.com/docs/marketing-api/reference/product-catalog/products/

catalogId
string
required
To identify in which catalgoue you wanted to add product

name
string
required
Name/title of the product item

category
string
required
Google product category for the item. If you need a custom category name instead, use field 'product_type'

currency
string
required
Currency for the product item

image_url
string
required
URL of the product image.

price
string
required
Price of the item with 2 digits added for cents (ex: use "100" for 1 or "599" for 5.99Product price

retailer_id
string
required
A unique identifier for this item (which can be a variant for a product).

description
string
Description of the product item. Max size: 5000

url
string
URL of the product item

brand
string
Brand of the product item

sale_price
string
Sale price of the item with 2 digits added for cents (ex: use "100" for 1 or "599" for 5.99)

sale_price_end_date
string
Date when the sale price ends

sale_price_start_date
string
Date when the sale price starts

Responses
200
Body

application/json

application/json
product
object
name
string
category
string
currency
string
image_url
string
price
string
retailer_id
string
description
string
url
string
brand
string
sale_price
string
sale_price_end_date
string
sale_price_start_date
string
id
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "catalogId": "738763614338341",
  "name": "Rolex7",
  "category": "Watch",
  "currency": "INR",
  "image_url": "https://thumbs.dreamstime.com/b/environment-earth-day-hands-trees-growing-seedlings-bokeh-green-background-female-hand-holding-tree-nature-field-gra-130247647.jpg",
  "price": "15000",
  "retailer_id": "1578l12",
  "description": "Rolex classic watch",
  "url": "https://thumbs.dreamstime.com/b/environment-earth-day-hands-trees-growing-seedlings-bokeh-green-background-female-hand-holding-tree-nature-field-gra-130247647.jpg",
  "brand": "AiSensy Comm Ltd",
  "sale_price": "14000",
  "sale_price_end_date": "27-03-2023",
  "sale_price_start_date": "24-03-2023"
}
{
  "catalogId": "738763614338341",
  "name": "Rolex7",
  "category": "Watch",
  "currency": "INR",
  "image_url": "https://thumbs.dreamstime.com/b/environment-earth-day-hands-trees-growing-seedlings-bokeh-green-background-female-hand-holding-tree-nature-field-gra-130247647.jpg",
  "price": "15000",
  "retailer_id": "1578l12",
  "description": "Rolex classic watch",
  "url": "https://thumbs.dreamstime.com/b/environment-earth-day-hands-trees-growing-seedlings-bokeh-green-background-female-hand-holding-tree-nature-field-gra-130247647.jpg",
  "brand": "AiSensy Comm Ltd",
  "sale_price": "14000",
  "sale_price_end_date": "27-03-2023",
  "sale_price_start_date": "24-03-2023"
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/create-product \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "catalogId": "738763614338341",
  "name": "Rolex7",
  "category": "Watch",
  "currency": "INR",
  "image_url": "https://thumbs.dreamstime.com/b/environment-earth-day-hands-trees-growing-seedlings-bokeh-green-background-female-hand-holding-tree-nature-field-gra-130247647.jpg",
  "price": "15000",
  "retailer_id": "1578l12",
  "description": "Rolex classic watch",
  "url": "https://thumbs.dreamstime.com/b/environment-earth-day-hands-trees-growing-seedlings-bokeh-green-background-female-hand-holding-tree-nature-field-gra-130247647.jpg",
  "brand": "AiSensy Comm Ltd",
  "sale_price": "14000",
  "sale_price_end_date": "27-03-2023",
  "sale_price_start_date": "24-03-2023"
}'
{
  "product": {
    "name": "string",
    "category": "string",
    "currency": "string",
    "image_url": "string",
    "price": "string",
    "retailer_id": "string",
    "description": "string",
    "url": "string",
    "brand": "string",
    "sale_price": "string",
    "sale_price_end_date": "string",
    "sale_price_start_date": "string",
    "id": "string"
  }
}

Get catalogue product
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/get-catalog-products
Returns a list of Products.

Request
Path Parameters
project_id
string
required
Query Parameters
catalogId
string
required
ID of the catalog whose products you want to fetch

limit
number
Default value is 20

skip
number
Default value is 0

status
boolean
It will filter product on the basis of there status

Responses
200
Body

application/json

application/json
responses
/
catalogueProducts
array[object]
_id
string
assistantId
string
catalogueId
string
productId
string
ageGroup
string
applinks
object
availability
string
categoryId
string
clientId
string
color
null
condition
string
createdAt
string
currency
string
customData
array[object]
defaultImageUrl
null
description
string
fbProductCategory
null or string
gender
string
imageCdnUrls
array[object]
imageFetchStatus
string
imageUrl
string
images
array[string]
inventory
integer
mobileLink
string
orderingIndex
integer
price
string
productName
string
quantityToSellOnFacebook
string
retailerId
string
retailerProductGroupId
string
reviewStatus
string
salePrice
string
shippingWeightUnit
string
shippingWeightValue
integer
status
boolean
updatedAt
string
url
string
visibility
string
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
catalogId*
:
string
limit
:
number
skip
:
number
status
:
Not SetFalseTrue

select an option
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/get-catalog-products \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "catalogueProducts": [
    {
      "_id": "string",
      "assistantId": "string",
      "catalogueId": "string",
      "productId": "string",
      "ageGroup": "string",
      "applinks": {
        "web": {
          "should_fallback": true,
          "url": "string"
        }
      },
      "availability": "string",
      "categoryId": "string",
      "clientId": "string",
      "color": null,
      "condition": "string",
      "createdAt": "string",
      "currency": "string",
      "customData": [
        {}
      ],
      "defaultImageUrl": null,
      "description": "string",
      "fbProductCategory": null,
      "gender": "string",
      "imageCdnUrls": [
        {
          "key": "string",
          "value": "string"
        }
      ],
      "imageFetchStatus": "string",
      "imageUrl": "string",
      "images": [
        "string"
      ],
      "inventory": 0,
      "mobileLink": "string",
      "orderingIndex": 0,
      "price": "string",
      "productName": "string",
      "quantityToSellOnFacebook": "string",
      "retailerId": "string",
      "retailerProductGroupId": "string",
      "reviewStatus": "string",
      "salePrice": "string",
      "shippingWeightUnit": "string",
      "shippingWeightValue": 0,
      "status": true,
      "updatedAt": "string",
      "url": "string",
      "visibility": "string"
    }
  ]
}

Sync catalogue products
get
https://apis.aisensy.com/project-apis/v1/project/{project_id}/sync-catalog-products
It will sync your business account connected catalogue product data

Request
Path Parameters
project_id
string
required
Responses
200
Body

application/json

application/json
status
boolean
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
Send API Request

Project APIs
curl --request GET \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/sync-catalog-products \
  --header 'Accept: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123'
{
  "status": true
}

Show/ hide catalogue on business profile
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/show-hide-catalogue-on-whatsapp
You can show or hide catalog on your business whatsapp profile

Request
Path Parameters
project_id
string
required
Body
application/jsonapplication/xml

application/json
For additional fields and information refer to https://developers.facebook.com/docs/whatsapp/on-premises/guides/commerce-guides/commerce-settings

isCatalogVisible
boolean
enableCart
boolean
Responses
200
Body

application/json

application/json
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "isCatalogVisible": true,
  "enableCart": true
}
{
  "isCatalogVisible": true,
  "enableCart": true
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/show-hide-catalogue-on-whatsapp \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "isCatalogVisible": true,
  "enableCart": true
}'
{}

Get Media By ID
post
https://apis.aisensy.com/project-apis/v1/project/{project_id}/get-media
Use this endpoint to fetch the media from CloudAPI using the media Id.

Request
Path Parameters
project_id
string
required
Project ID

Body
application/jsonapplication/xml

application/json
id
string
required
Media ID

responseType
string
Supported formats: "arraybuffer", "json", "text", "stream". Defaults to arraybuffer

Responses
200
Headers
Content-Length
string
Size of the file

Content-Type
string
Mime Type of the buffer

Body

application/json

application/json
X-AiSensy-Project-API-Pwd
:
123
project_id*
:
string
{
  "isCatalogVisible": true,
  "enableCart": true
}
{
  "isCatalogVisible": true,
  "enableCart": true
}
Send API Request

Project APIs
curl --request POST \
  --url https://apis.aisensy.com/project-apis/v1/project/{project_id}/get-media \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'X-AiSensy-Project-API-Pwd: 123' \
  --data '{
  "isCatalogVisible": true,
  "enableCart": true
}'
{}

