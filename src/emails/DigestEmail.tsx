import { Button, Heading, Section, Text } from "react-email";
import { buttonStyle, EmailLayout, mutedStyle, textStyle } from "./Layout";

export interface DigestTree {
  treeName: string;
  treeUrl: string;
  entries: { description: string; at: string }[];
  /** Entries beyond those listed. */
  more: number;
}

export interface DigestEmailProps {
  name: string | null;
  trees: DigestTree[];
  settingsUrl: string;
}

export default function DigestEmail({ name, trees, settingsUrl }: DigestEmailProps) {
  const total = trees.reduce((sum, tree) => sum + tree.entries.length + tree.more, 0);
  return (
    <EmailLayout
      preview={`${total} ${total === 1 ? "change" : "changes"} in your family trees yesterday.`}
      footerNote={`You get this daily digest because it's on in your notification settings: ${settingsUrl}`}
    >
      <Text style={textStyle}>{name ? `Hi ${name},` : "Hi,"} here is what changed in the last 24 hours.</Text>
      {trees.map((tree) => (
        <Section key={tree.treeUrl} style={{ marginBottom: "20px" }}>
          <Heading as="h2" style={{ color: "#111827", fontSize: "16px", margin: "0 0 8px" }}>
            {tree.treeName}
          </Heading>
          {tree.entries.map((entry, index) => (
            <Text key={index} style={{ ...textStyle, margin: "0 0 6px" }}>
              • {entry.description} <span style={{ color: "#6b7280" }}>({entry.at})</span>
            </Text>
          ))}
          {tree.more > 0 && <Text style={mutedStyle}>…and {tree.more} more.</Text>}
          <Button href={tree.treeUrl} style={{ ...buttonStyle, padding: "8px 14px", fontSize: "14px" }}>
            Open tree
          </Button>
        </Section>
      ))}
    </EmailLayout>
  );
}

DigestEmail.PreviewProps = {
  name: "Ada",
  trees: [
    {
      treeName: "The Stone Family",
      treeUrl: "http://localhost:3000/tree/abc",
      entries: [
        { description: "George added Mary Stone (1945–2019)", at: "14:02 UTC" },
        { description: "George linked Mary Stone as spouse of David Stone", at: "14:03 UTC" },
      ],
      more: 0,
    },
  ],
  settingsUrl: "http://localhost:3000/settings/notifications",
} satisfies DigestEmailProps;
