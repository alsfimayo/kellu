/** @jsxImportSource react */
import { Body, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'

interface EmailVerificationProps {
  verificationLink: string
  userName?: string | null
}

export const EmailVerification = ({ verificationLink, userName }: EmailVerificationProps) => {
  return (
    <Html>
      <Head />
      <Preview>Verify your email address to complete your Class Gecko account setup</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Email Verification</Heading>
          <Text style={text}>{userName ? `Hi ${userName},` : 'Hi there,'}</Text>
          <Text style={text}>
            Please check your email and click the verification link to verify your account.
          </Text>
          <Container style={card}>
            <Text style={cardHeading}>Check Your Email</Text>
            <Text style={cardText}>
              We've sent a verification link to your email address. Please check your inbox and
              click the link to verify your account.
            </Text>
            <Link href={verificationLink} style={button}>
              Verify Email Address
            </Link>
          </Container>
          <Text style={footer}>
            Need help? <Link href="mailto:support@classgecko.com">Contact Support</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '600px',
}

const h1 = {
  color: '#000000',
  fontSize: '32px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}

const text = {
  color: '#666666',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const,
  margin: '0 0 16px',
}

const card = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '32px',
  margin: '24px 0',
  textAlign: 'center' as const,
}

const cardHeading = {
  color: '#000000',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 16px',
}

const cardText = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 24px',
}

const button = {
  backgroundColor: '#14b8a6',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

const footer = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  margin: '32px 0 0',
}

export default EmailVerification
