import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "react-email";

const body = { backgroundColor: "#f6f7f6", fontFamily: "Helvetica, Arial, sans-serif", margin: 0 };
const container = { backgroundColor: "#ffffff", margin: "24px auto", padding: "32px", maxWidth: "560px", borderRadius: "8px" };
const brand = { color: "#047857", fontSize: "18px", fontWeight: 700, margin: "0 0 16px" };
const footer = { color: "#6b7280", fontSize: "12px", margin: 0 };

export const textStyle = { color: "#111827", fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" };
export const mutedStyle = { color: "#6b7280", fontSize: "13px", lineHeight: "20px", margin: "0 0 12px" };
export const buttonStyle = {
  backgroundColor: "#047857",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
};

/** Shared frame for every FamilyForest email. */
export function EmailLayout({
  preview,
  footerNote,
  children,
}: {
  preview: string;
  footerNote?: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>🌳 FamilyForest</Text>
          <Section>{children}</Section>
          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0 16px" }} />
          <Text style={footer}>{footerNote ?? "You're receiving this email because you have a FamilyForest account."}</Text>
        </Container>
      </Body>
    </Html>
  );
}
