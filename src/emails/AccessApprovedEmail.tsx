import { Button, Text } from "react-email";
import { buttonStyle, EmailLayout, textStyle } from "./Layout";

export interface AccessApprovedEmailProps {
  treeName: string;
  treeUrl: string;
}

export default function AccessApprovedEmail({ treeName, treeUrl }: AccessApprovedEmailProps) {
  return (
    <EmailLayout preview={`You now have access to ${treeName}.`}>
      <Text style={textStyle}>
        The owner approved you: you can now view <strong>{treeName}</strong> and add relationships
        to it.
      </Text>
      <Button href={treeUrl} style={buttonStyle}>
        Open {treeName}
      </Button>
    </EmailLayout>
  );
}

AccessApprovedEmail.PreviewProps = {
  treeName: "The Stone Family",
  treeUrl: "http://localhost:3000/tree/abc",
} satisfies AccessApprovedEmailProps;
