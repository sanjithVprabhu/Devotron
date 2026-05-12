Project Webhook
Webhooks provide the ability to receive real-time data updates about activities in your AiSensy project.

Choose to receive data by subscribing to topics and have all applicable data sent to a URL of your choice. You can then use your own custom script to read, save, and do whatever you want with that data. This is a powerful option that allows you to keep all of your data in sync and opens up the possible integration options like never before.

The main concepts for webhooks are subscriptions, topics, and notifications.

Subscriptions
A subscription is where you provide an endpoint & select a topic/topics you want to be notified about.

Topics
A subscription will contain one or more topics. Topics are types of events that you want to be informed about.

Notifications
The request was sent to the webhook-endpoint/application about the subscribed topic. It contains updates & necessary data to enable automations.

Webhook Topics
The following topics are available and you can be notified when an action relating to that topic occurs. 

Topic Name	Resource Name	Description
contact.created	Contact	Triggered when a new contact gets created
DEPRECATED contact.attribute.updated	Contact	Triggered when attributes gets updated in the contact. Note: This topic is deprecated. Please use contact.attribute.revised instead
message.created	Message	Triggered when a new message is sent by assistant or agent or user or through broadcasts
message.status.updated	Message	Triggered when message status gets updated
message.sender.user	Message	Triggered when a user sends message to the business
DEPRECATED contact.tag.added	Contact	Triggered when a new tag gets added to a contact. Note: This topic is deprecated. Please use contact.tag.updated instead
DEPRECATED contact.tag.removed	Contact	Triggered when a existing tag gets removed from a contact. Note: This topic is deprecated. Please use contact.tag.updated instead
DEPRECATED contact.first_message.added	Contact	Triggered when first message tag is added to a contact. Note: This topic is deprecated. Please use contact.first_message.updated instead
DEPRECATED contact.first_message.removed	Contact	Triggered when first message tag is removed. Note: This topic is deprecated. Please use contact.first_message.updated instead
contact.chat.intervened	Contact	Triggered when agent intervenes a chat
contact.chat.closed	Contact	Triggered when agent closes a intervened chat
contact.chat.requesting	Contact, Message	Triggered every time when chatbot returns Fallback response to user queries
contact.campaign.sent	Contact, Message	Triggered when campaign is sent to a contact
contact.campaign.delivered	Contact, Message	Triggered when campaign is delivered to a contact
contact.campaign.read	Contact, Message	Triggered when campaign is read by the contact
order.placed	Order, Placed	Triggered when a user places an order
payment.captured	Payment, Captured	Triggered when a user completes payment
payment.refunded	Payment, Refunded	Triggered when a refund request for an order is processed
contact.first_message.updated	Contact	Triggered when the first message tag is either added or removed from the contact
contact.tag.updated	Contact	Triggered when a tag is either added or removed from a contact
contact.attribute.revised	Contact	Triggered when attributes gets updated in the contact

Notes -

For bulk import contacts, contact.created notification are not sent. This is to avoid throttling on your webhook endpoint.
Current implementation of webhooks is in beta phase. Specifications or models may change in official release. We'll try our best to make it backwards compatible.
Webhook Request
Request sent to the webhook endpoint

HTTP Method. POST

Headers

Name	Description
Content-type	application/json
X-AiSensy-Signature	Signed payload to verify the authenticity of request.
X-AiSensy-API-Version	Webhook API version. Use this to avoid payload structure mismatches with new releases.
X-AiSensy-Project-Id	Project Id with which the notification is associated with.
Request Body Notification object

Expected Response

Endpoint is expected to return 2xx status

Notification Object
Request body which is sent with every webhook request.

{
  "id": "",
  "created_at": "",
  "topic": "",
  "delivery_attempt": 2,
  "app_id": "",
  "webhook_id": "",
  "project_id": "",
  "data": {}
}
Field Name	Description
id	Unique notification id
created_at	The timestamp the notification was created. (milliseconds)
topic	Type of the notification
delivery_attempt	Number of time notification has been tried to delivered
app_id	Id of the app with which the webhook is associated.
webhook_id	Unique id of webhook
project_id	Project Id with which the notification is associated with.
data	The data associated with the notification.
Notification Data
Data sent with different topics. You'll be receiving resource object with "type" field inside them to identify the data structures in them.

See details about {CONTACT_OBJECT} & {MESSAGE_OBJECT} below.

Value of data field for different topics -

• contact.created

{
  "contact": "CONTACT_OBJ"
}
• contact.first_message.updated

{
  "contact": "{CONTACT_OBJECT}",
  "first_message": {
    "type": "first_message",
    "id": "",
    "added_at": ""
  }
}
• contact.tag.updated

{
  "contact": "{CONTACT_OBJECT}",
  "tag": {
    "type": "tag",
    "id": "",
    "added_by": "",
    "added_at": ""
  }
}
• contact.attribute.revised

{
  "contact": "{CONTACT_OBJECT}",
  // Updated attributes in this object
  "attribute": {
    "type": "attribute",
    // Key value pairs of your attributes' name
    "fields": {}
  }
}
• DEPRECATED contact.attribute.updated

{
  "contact": "{CONTACT_OBJECT}",
  // Updated attributes in this object
  "attribute": {
    "type": "attribute",
    // Key value pairs of your attributes' name
    "fields": {}
  }
}
• DEPRECATED contact.tag.added

{
  "contact": "{CONTACT_OBJECT}",
  "tag": {
    "type": "tag",
    "id": "",
    "added_by": "",
    "added_at": ""
  }
}
• DEPRECATED contact.tag.removed

{
  "contact": "{CONTACT_OBJECT}",
  "tag": {
    "type": "tag",
    "id": "",
    "removed_by": "",
    "removed_at": ""
  }
}
• DEPRECATED contact.first_message.added

{
  "contact": "{CONTACT_OBJECT}",
  "first_message": {
    "type": "first_message",
    "id": "",
    "added_at": ""
  }
}
• DEPRECATED contact.first_message.removed

{
  "contact": "{CONTACT_OBJECT}",
  "first_message": {
    "type": "first_message",
    "id": "",
    "removed_at": ""
  }
}
• contact.chat.[intervened / closed]

{
  "contact": "{CONTACT_OBJECT}"
}
• contact.chat.requesting

{
  "contact": "{CONTACT_OBJECT}",
  "message": "{MESSAGE_OBJECT}"
}
• contact.campaign.[sent/ read]

{
  "contact": "{CONTACT_OBJECT}",
  "message": "{MESSAGE_OBJECT}"
}
• message.created

{
  "message": "{MESSAGE_OBJECT}"
}
• message.status.updated

{
  "message": "{MESSAGE_OBJECT}"
}
• message.sender.user

{
  "message": "{MESSAGE_OBJECT}"
}
• order.placed

{
  "order": "{ORDER_OBJECT}"
}
• payment.captured

{
  "payment": "{PAYMENT_OBJECT}"
}
• payment.refunded

{
  "payment": "{PAYMENT_OBJECT}"
}
Resource Objects
Contact Object

{
  "type": "contact",
  "id": "",
  "project_id": "",
  "name": "",
  "phone_number": "",
  "is_closed": false,
  "is_requesting": false,
  "is_intervened": false,
  "created_at": "Date",
  "tags": [ { "id": "", "added_at": "", "added_by": "" }],
  "attributes": {},
  "last_active": "Date",
  "last_message": "Date",
  "source": "",
  "country_code": "",
  "first_messaage": { "id": "", "added_at": "" }
}
Field Name	Description
id	String
Contact Id
project_id	String
Project id
name	String
Name of the contact on WhatsApp
phone_number	String
WhatsApp Number of contact
is_closed	Boolean
Closed status
is_requesting	Boolean
Requesting status
is_intervened	Boolean
Intervened status
created_at	Number
Indicates the timestamp(in milli seconds) when the contact was created.
tags	Array
Tags assigned to the contact.
tags.id	String
Id of tag assigned to the contact. View specific tag in AiSensy App to find its id.
tags.added_at	Number
Indicates the timestamp(in milli seconds) when the tag was assigned.
tags.added_by	String
Id of agent
attributes	Object
Contains key-value pairs of all the attributes assigned to the contact.
last_active	Number
Indicates the timestamp(in milli seconds) when the contact has sent last message to the business.
last_message	Number
Indicates the timestamp(in milli seconds) when the last message has been sent (either by business or contact).
source	String
Source of contact through which the contact was created.
country_code	String
Country code of the contact's WhatsApp number.
first_message.id	String
Id of the tag assigned to the contact based on the first message.
first_message.added_at	Number
Indicates the timestamp(in milli seconds) when the first message tag was assigned to the contact.
Message Object

{
  "type": "message",
  "id": "",
  "project_id": "",
  "phone_number": "",
  "contact_id": "",
  "campaign": { "name": "", "sent_at": ""},
  "sender": "",
  "message_content": {}, // message payload
  "message_type": "TEXT", 
  "status": "",
  "is_HSM": false,
  "chatbot_response": {
    "queryText": "",
    "intent": "",
  },
  "delivered_at": "Date",
  "read_at": "Date",
  "sent_at": "Date",
  "failed_at": "Date"
  "agent_id": "",
  "failureResponse": {"code": "", "reason": ""},
  "messageId": ""
}
Field Name	Description
id	String
Unique Identifier of the event
project_id	String
Project id
phone_number	String
WhatsApp Number of contact
contact_id	String
Contact Id
campaign	Object
If the message is part of any campaign, it will have details related to it.
campaign.name	String
Name of the campaign sent
campaign.sent_at	Number
Indicates the timestamp(in milli seconds) when the campaign was sent.
sender	String
It represents who sent that message.
It can have following values -




message_content	Object
Details related to the content of the message.
message_type	String
Type of message sent.
It can have following values -





status	String
Message status. It can have following values -






is_HSM	Boolean
Represents whether the message was template message or session message. For true value, it is template message.
chatbot_response.queryText	String
Query sent by the contact for which this message has been sent to the contact.
chatbot_response.intent	String
Intent detected by Dialogflow
delivered_at	Number
Indicates the timestamp(in milli seconds) when the message status was set to Delivered.
read_at	Number
Indicates the timestamp(in milli seconds) when the message status was set to Read.
sent_at	Number
Indicates the timestamp(in milli seconds) when the message status was set to Sent.
failed_at	Number
Indicates the timestamp(in milli seconds) when the message status was set to Failed.
agent_id	String
Agent id of the agent who sent this message. Applicable for sender set to AGENT.
failureResponse.code	Number
Message failure code
failureResponse.reason	Number
Message failure reason
messageId	String
Unique identifier of the message
Order Object

{
   "phone_number":"",
   "catalog_id":"",
   "text":"",
   "product_items":[
      {
         "product_retailer_id":"",
         "quantity":1,
         "item_price":1,
         "currency":"INR"
      }
   ]
}
Field Name	Description
phone_number	String
WhatsApp Number of the contact
messageId	String
Unique identifier of the message
catalog_id	String
Unique identifier of the message
product_items.product_retailer_id	String
Unique identifier of the product
product_items.quantity	Number
Product Quantity selected
product_items.item_price	Number
Product Quantity selected
product_items.currency	String
Currency
Payment Object

{
   "phone_number":"",
   "reference_id":"",
   "amount":{
      "value":1000,
      "offset":100
   },
   "currency":"INR",
   "transaction":{
      "id":"",
      "type":"",
      "status":"captured",
      "created_timestamp":1703063690,
      "updated_timestamp":1703063690,
      "refunds":[
         {
            "id":"",
            "amount":{
               "value":1000,
               "offset":100
            },
            "speed_processed":"normal",
            "status":"completed",
            "created_timestamp":1703067598,
            "updated_timestamp":1703067642
         }
      ],
      "amount":{
         "value":10000,
         "offset":1000
      },
      "currency":"INR"
   },
   "notes":{
      "referenceId":"",
      "source":"Whatsapp Pay via AiSensy"
   }
}
Field Name	Description
phone_number	String
WhatsApp Number of the contact
messageId	String
Unique identifier of the message
reference_id	String
Unique identifier of the message
currency	String
Currency of the transaction
amount.value	Number
Positive integer representing the amount value multiplied by offset. For example, ₹12.34 has value 1234.
amount.offset	Number
The given offset for the transaction
transaction.id	String
Unique identifier of the transaction
transaction.type	String
Type of the transaction
transaction.status	String
Product Quantity selected
transaction.created_timestamp	Number
Time when transaction was created in epoch seconds.
transaction.updated_timestamp	Number
Time when transaction was last updated in epoch seconds.
transaction.refunds	Array[Optional]
The list of refunds for this order.Each refund object contains the following fields

id
String
The alpha-numeric ID of the refund.

amount
Object
The total amount of the refund.

speed_processed
String
Speed by which refund was processed. Can be one of instant or normal.

status
String
The status of the refund. Can be one of pending, success or failed.

created_timestamp
Number
Time when refund was created in epoch seconds.

updated_timestamp
Number
Time when refund was last updated in epoch seconds.
transaction.notes	String[Optional]
Supported for only Razorpay PG, this contains the key-value pairs sent as part of Order Details message.
notes.referenceId	String
Reference Id of the transaction
notes.source	String
Source of the note
---	
Handling Webhook Requests
When you setup a subscription you will receive notifications on your chosen topics. How you handle those notifications, i.e. the HTTP status code returned, will determine the subsequent state of that subscription.

Webhook should process inbound notifications asynchronous but acknowledge its reception synchronously & immediately. Best acknowledge time should be less than 100 millisecond, it is understood that there can be a network delay. Hence, recommended is within 500-1000 millisecond. The greater your response time, the more delayed inbound notifications the webhook will receive each time.
It is expected to receive 2xx response from Webhook endpoint within 5s, otherwise It will be marked failed.
Notification will be delivered at-least one time. For some reason(e.g.- Network issue or API timeout) if notification delivery is marked failed, It will be retried again after 5mins.
As same notification can be delivered multiple times, design your application/endpoint to handle such scenarios. You can use notification id & delivery attempts fields sent in the notifications to handle in these scenarios.
Ideally, you should receive webhook in the order in which the notifications occur. However, you may not always receive the webhooks in the order.
Response Code	Description	Action
2xx	Success	The webhook was successfully delivered.
410	Gone	When a 410 is received, we assume the resource is no longer available. We will disable the subscription and no more notifications will be sent.
4xx (excl. 429)5xx	Client or service errors	Webhook will be retried once after 5mins.
If the webhook is repeatedly failing to respond, It will be disabled.
Having more than 100 failed delivery attempts in 20 minutes period will cause temporary disabling of the webhook. You can re-enable it from the dashboard after fixing the issues.
Verifying Request Authenticity
Each webhook notification is signed by AiSensy via an X-AiSensy-Signature header. We do this so that you can verify the notification came from AiSensy by decoding the signature.

The hash signature is calculated using HMAC with SHA-2 algorithm with your webhook's shared-secret set as the key and the webhook request body as the message.

The signature is the hexadecimal representation of a SHA-2 signature computed using the HMAC algorithm.

Note: Do Not Parse or Cast the Webhook Request Body**.** While generating the signature at your end, ensure that the webhook body passed as an argument is the raw webhook request body.

Node.js example for webhook authentication
const express = require('express');
const bodyParser = require('body-parser');
const { createHmac } = require("crypto");

app.use(bodyParser.json());

const createHash = async (text, secret) => {
  const hash = createHmac("sha256", secret).update(text).digest("hex");
  return hash;
};

app.post('/test-webhook-signature', async(req, res) => {
	try {
		const notification = req.body;
		const receivedSignature = req.headers["x-aisensy-signature"];
		const sharedSecret = "WEBHOOK_SHARED_SECRET"; 
        // Provide the notificaiton data as it is
		const generatedSignature = await createHash(`${JSON.stringify(notification)}`, sharedSecret);
        
		if (receivedSignature === generatedSignature) {
			res.status(200).send("Signature Matched");
		} else {
			res.status(500).send("Signature didn't Match");
		}
	} catch(err) {
		console.error(err);}
})
app.listen(3222);