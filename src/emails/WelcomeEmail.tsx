import { Button, Text } from "react-email";
import { buttonStyle, EmailLayout, mutedStyle, textStyle } from "./Layout";

export interface WelcomeEmailProps {
  name: string | null;
  dashboardUrl: string;
}

export default function WelcomeEmail({ name, dashboardUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout preview="Start your family tree in two steps.">
      <Text style={textStyle}>{name ? `Hi ${name},` : "Hi,"}</Text>
      <Text style={textStyle}>
        Welcome to FamilyForest, a shared place to map your family, add photos and stories, and
        build the tree together with your relatives.
      </Text>
      <Text style={textStyle}>
        <strong>Quick start:</strong>
        <br />
        1. Create your first tree
        <br />
        2. Add a family member
      </Text>
      <Button href={dashboardUrl} style={buttonStyle}>
        Go to your dashboard
      </Button>
      <Text style={{ ...mutedStyle, marginTop: "16px" }}>
        You can invite relatives as editors or viewers from any tree&apos;s Share button.
      </Text>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = { name: "Ada", dashboardUrl: "http://localhost:3000/dashboard" } satisfies WelcomeEmailProps;
