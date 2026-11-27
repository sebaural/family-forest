import { Button, Text } from "react-email";
import { buttonStyle, EmailLayout, textStyle } from "./Layout";

export interface ApprovalRequestEmailProps {
  personName: string;
  personEmail: string;
  inviterName: string;
  treeName: string;
  approvalsUrl: string;
}

export default function ApprovalRequestEmail({
  personName,
  personEmail,
  inviterName,
  treeName,
  approvalsUrl,
}: ApprovalRequestEmailProps) {
  return (
    <EmailLayout
      preview={`${personName} is waiting for your approval to join ${treeName}.`}
      footerNote="You get this email because you own the tree. They can't see it until you agree."
    >
      <Text style={textStyle}>
        <strong>{personName}</strong> ({personEmail}) accepted {inviterName}&apos;s invitation to{" "}
        <strong>{treeName}</strong> and is waiting for your approval.
      </Text>
      <Button href={approvalsUrl} style={buttonStyle}>
        Review the request
      </Button>
    </EmailLayout>
  );
}

ApprovalRequestEmail.PreviewProps = {
  personName: "Ada Stone",
  personEmail: "ada@example.com",
  inviterName: "George Stone",
  treeName: "The Stone Family",
  approvalsUrl: "http://localhost:3000/settings/approvals",
} satisfies ApprovalRequestEmailProps;
