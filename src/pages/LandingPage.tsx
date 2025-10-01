import { Link } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Chip, Divider } from '@heroui/react';
import { SharedHeader } from '../components/SharedHeader';
import { SharedFooter } from '../components/SharedFooter';


type PurposeCard = {
  title: string;
  description: string;
  icon: string;
};

const purposeCards: PurposeCard[] = [
  {
    title: 'Transparency',
    description: "Make tree removal decisions visible to all citizens. See what's happening in your neighborhood and understand the impact on your community.",
    icon: '🔍',
  },
  {
    title: 'Advocacy',
    description: "Empower residents to appeal inappropriate tree removals. Access permit information and connect with the city's decision-making process.",
    icon: '⚖️',
  },
  {
    title: 'Awareness',
    description: 'Share insights, organize appeals, and celebrate preservation successes together.',
    icon: '🌱',
  },
];

type InstructionStep = {
  step: string;
  title: string;
  text: string;
};

const instructionSteps: InstructionStep[] = [
  {
    step: '1',
    title: 'Scan the city',
    text: 'Pan and zoom the map to find permits near you. Recent weeks are highlighted in the range selector.',
  },
  {
    step: '2',
    title: 'Inspect the details',
    text: 'Click any marker to open species, size, location, owner, and reason for removal. Copy the permit number with one tap.',
  },
  {
    step: '3',
    title: 'Act quickly',
    text: 'Use Street View context to confirm site conditions, then coordinate appeals or outreach with neighbors.',
  },
];

type LandingPageProps = {
  onOpenMapPath: string;
};


function HeroSection({ onOpenMapPath }: LandingPageProps) {
  return (
    <section id="hero" className="relative overflow-hidden bg-gradient-to-br from-[#2d5016] to-[#6b7c32] text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Protect Atlanta&apos;s Urban Forest
          </h1>
          <div className="max-w-xl">
            <p className="text-lg font-medium italic text-white/95">
              We made this site after a beloved street tree on our block was cut down overnight. By mapping Atlanta&apos;s tree-removal permits, we shine light on what&apos;s planned—so neighbors can speak up before the next canopy falls.
            </p>
            <p className="mt-2 text-sm font-semibold text-white/90">
              — Tree Heroes Team
            </p>
          </div>
          <p className="max-w-xl text-base text-primary-foreground/85">
            Discover tree removal permits in your neighborhood. Stay informed, take action, and help preserve Atlanta&apos;s green canopy for future generations.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button as={Link} to={onOpenMapPath} color="primary" radius="full" size="lg" variant="solid">
              Open the map
            </Button>
            <Button
              as="a"
              href="#instructions"
              color="primary"
              radius="full"
              size="lg"
              variant="bordered"
              className="border-primary-foreground/70 text-primary-foreground hover:bg-primary-foreground/10"
            >
              Learn how to help
            </Button>
          </div>
        </div>
        <Card className="bg-primary-foreground/15 backdrop-blur" radius="lg" shadow="sm">
          <CardHeader className="flex flex-col gap-2 pb-0 text-white">
            <h3 className="text-xl font-semibold !text-white">Why track permits?</h3>
            <p className="text-sm text-white/80">Open data is powerful when the community can see what&apos;s happening nearby.</p>
          </CardHeader>
          <CardBody className="flex flex-col gap-2 text-sm text-white/85 pb-1">
            <p>• Spot tree removal hotspots and trends.</p>
            <p>• Prepare for hearings with permit-level details.</p>
            <p>• Rally neighbors around canopy preservation.</p>
            <p className="text-xs text-white/70">
              Powered by civic data and refreshed frequently. We handle the visuals—you bring the insight.
            </p>
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

function PurposeSection() {
  return (
    <section id="purpose" className="py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-bold text-foreground">Why Protecting Our Trees Matters</h2>
          <p className="max-w-3xl text-foreground-600">
            Understanding tree removal decisions helps us protect Atlanta's green canopy for future generations.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {purposeCards.map((card) => (
            <Card key={card.title} radius="lg" shadow="sm">
              <CardBody className="flex flex-col gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">{card.icon}</span>
                <h3 className="text-lg font-semibold text-foreground">{card.title}</h3>
                <p className="text-sm text-foreground-600">{card.description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapInvitation({ onOpenMapPath }: LandingPageProps) {
  return (
    <section id="map" className="py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">Explore the permits map</h2>
          <p className="max-w-2xl text-base text-foreground-600">
            Head to the full-screen map experience for Street View context, reason filters, and permit level detail.
          </p>
          <Button as={Link} to={onOpenMapPath} color="primary" radius="full" size="lg" variant="solid">
            Launch full map
          </Button>
        </div>
      </div>
    </section>
  );
}

function InstructionsSection() {
  return (
    <section id="instructions" className="py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-bold text-foreground">How to use this site</h2>
          <p className="max-w-3xl text-foreground-600">
            Follow these steps to get the most out of Tree Heroes and take action to protect Atlanta&apos;s canopy.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {instructionSteps.map((item) => (
            <Card key={item.step} radius="lg" shadow="sm">
              <CardBody className="flex flex-col gap-3">
                <Chip color="primary" variant="flat" radius="full" className="w-fit px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  Step {item.step}
                </Chip>
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-foreground-600">{item.text}</p>
              </CardBody>
            </Card>
          ))}
        </div>
        <Divider />
        <Card radius="lg" shadow="sm">
          <CardBody className="flex flex-col items-center gap-4 text-center">
            <h3 className="text-2xl font-semibold text-foreground">Want to contribute data stories?</h3>
            <p className="max-w-2xl text-sm text-foreground-600">
              Tree Heroes thrives when residents surface patterns. Share insights, submit clarifications, or recommend improvements—we will fold them into future releases.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button as="a" href="mailto:info@treeheroesatl.org" color="primary" radius="full" size="md">
                Email the team
              </Button>
              <Button as={Link} to="/map" variant="bordered" color="primary" radius="full" size="md">
                Return to map
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </section>
  );
}


export default function LandingPage({ onOpenMapPath }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SharedHeader />
      <main className="flex flex-col">
        <HeroSection onOpenMapPath={onOpenMapPath} />
        <PurposeSection />
        <MapInvitation onOpenMapPath={onOpenMapPath} />
        <InstructionsSection />
      </main>
      <SharedFooter onOpenMapPath={onOpenMapPath} />
    </div>
  );
}
