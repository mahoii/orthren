import Twilio from 'twilio'

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function sendSms(to: string, body: string) {
  return client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER!, // buy a number ~$1/month
    to
  })
}