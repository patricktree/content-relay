import { styled } from "@linaria/react";

type AccentBarProps = {
  $accentColor: string;
};

export function App(): React.JSX.Element {
  return (
    <Page>
      <Card>
        <AccentBar $accentColor="#7c3aed" />
        <Title>Content Relay</Title>
        <Message>Linaria is wired up for the mobile app.</Message>
      </Card>
    </Page>
  );
}

const Page = styled.main`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #000000;
  color: #ffffff;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
`;

const Card = styled.section`
  width: 100%;
  max-width: 360px;
  padding: 24px;
  border: 1px solid #ffffff;
  text-align: center;
`;

const AccentBar = styled.div<AccentBarProps>`
  width: 64px;
  height: 4px;
  margin: 0 auto 16px;
  background: ${(props) => props.$accentColor};
`;

const Title = styled.h1`
  margin: 0;
  font-size: 32px;
`;

const Message = styled.p`
  margin: 16px 0 0;
  font-size: 16px;
  line-height: 1.5;
`;
