import { Button, Text } from "react-email";
import { buttonStyle, EmailLayout, textStyle } from "./Layout";

export interface InviteAcceptedEmailProps {
  collaboratorName: string;
  treeName: string;
  role: "EDITOR" | "VIEWER";
  treeUrl: string;
  settingsUrl: string;
}

export default function InviteAcceptedEmail({
  collaboratorName,
  treeName,
  role,
  treeUrl,
  settingsUrl,
}: InviteAcceptedEmailProps) {
  return (
    <EmailLayout
      preview={`${collaboratorName} joined ${treeName}.`}
      footerNote={`You can turn these emails off in your notification settings: ${settingsUrl}`}
    >
      <Text style={textStyle}>
        <strong>{collaboratorName}</strong> accepted your invitation to <strong>{treeName}</strong>{" "}
        and can now {role === "EDITOR" ? "view and edit" : "view"} the tree.
      </Text>
      <Button href={treeUrl} style={buttonStyle}>
        Open {treeName}
      </Button>
    </EmailLayout>
  );
}

InviteAcceptedEmail.PreviewProps = {
  collaboratorName: "George Stone",
  treeName: "The Stone Family",
  role: "EDITOR",
  treeUrl: "http://localhost:3000/tree/abc",
  settingsUrl: "http://localhost:3000/settings/notifications",
} satisfies InviteAcceptedEmailProps;
