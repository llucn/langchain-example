import { Card, CardContent, CardHeader, CardTitle } from '@techconnect/design-system';

export function HomePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
      </CardHeader>
      <CardContent>NestJS + React monorepo skeleton.</CardContent>
    </Card>
  );
}
