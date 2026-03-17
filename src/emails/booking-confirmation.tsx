/** @jsxImportSource react */

import { Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

export interface BookingConfirmationEmailProps {
  clientName: string
  serviceTitle: string
  date: string
  timeRange: string
  assignedTeamMemberName: string
  businessName: string
}

export const BookingConfirmationEmail = ({
  clientName,
  serviceTitle,
  date,
  timeRange,
  assignedTeamMemberName,
  businessName,
}: BookingConfirmationEmailProps) => {
  return (
    <EmailLayout preview="Your booking has been confirmed">
      <Section style={emailStyles.content}>
        <Text style={emailStyles.text}>Dear {clientName},</Text>
        <Text style={emailStyles.text}>
          Your booking has been confirmed for {serviceTitle}.
        </Text>
        <Section style={emailStyles.card}>
          <Text style={emailStyles.cardHeading}>Schedule details</Text>
          <Text style={emailStyles.cardText}>
            Date: {date}
            <br />
            Time: {timeRange}
            <br />
            Assigned team member: {assignedTeamMemberName}
          </Text>
        </Section>
        <Text style={emailStyles.text}>
          If you have any questions or need to reschedule, please contact {businessName} directly.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default BookingConfirmationEmail
