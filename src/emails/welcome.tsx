/** @jsxImportSource react */

import { Container, Heading, Section, Text } from '@react-email/components'
import { EmailLayout, emailStyles } from './components/email-layout'

interface WelcomeEmailProps {
  userName?: string | null
}

export const WelcomeEmail = ({ userName }: WelcomeEmailProps) => {
  return (
    <EmailLayout preview="Welcome to Class Gecko! We're excited to have you on board.">
      {/* Main Content */}
      <Section style={emailStyles.content}>
        <Heading style={emailStyles.h1}>Welcome to Class Gecko!</Heading>
        <Text style={emailStyles.text}>{userName ? `Hi ${userName},` : 'Hi there,'}</Text>
        <Text style={emailStyles.text}>
          Thank you for signing up with Class Gecko! We're thrilled to have you join our platform.
        </Text>
        <Container style={emailStyles.card}>
          <Text style={emailStyles.cardHeading}>Get Started</Text>
          <Text style={emailStyles.cardText}>
            Fill out your onboarding data to complete your profile setup, and then continue using
            the platform to manage your classes, enrollments, and more. If you have any questions or
            need assistance, our support team is here to help.
          </Text>
        </Container>
        <Text style={emailStyles.text}>
          Complete your onboarding to unlock all features. We're here to make managing your classes
          easier and more efficient. Explore all the features we have to offer and make the most of
          your Class Gecko experience.
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default WelcomeEmail
