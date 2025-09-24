import { Scene3D } from "@/components/Scene3D";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Zap, Search, Target, Trash2, Scan, Shield } from "lucide-react";

export default function Home() {
  const features = [
    {
      icon: <Scan className="h-6 w-6" />,
      title: "Unlimited Scans",
      description: "Process unlimited dump files without restrictions"
    },
    {
      icon: <Target className="h-6 w-6" />,
      title: "Advanced Dump Analyzer",
      description: "Sophisticated analysis of your dump files with detailed insights"
    },
    {
      icon: <Search className="h-6 w-6" />,
      title: "Location Finder",
      description: "Precisely locate important data within your dumps"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Auto Detected Triggers",
      description: "Automatically identify and categorize triggers"
    },
    {
      icon: <Search className="h-6 w-6" />,
      title: "Search Keywords",
      description: "Powerful keyword search across all your data"
    },
    {
      icon: <Trash2 className="h-6 w-6" />,
      title: "Webhook Deleter",
      description: "Clean and manage webhooks efficiently"
    }
  ];

  return (
    <div className="min-h-screen pt-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background/50" />
        <div className="container mx-auto px-4 py-20 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl lg:text-6xl font-bold mb-6">
                <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  Evolution
                </span>
                <br />
                <span className="text-foreground">TriggerFinder</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl">
                Advanced dump analysis and trigger detection system. 
                Unlock the power of automated scanning and detection.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link to="/auth?mode=signup">
                  <Button size="lg" className="w-full sm:w-auto">
                    Get Started
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <Scene3D />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Powerful Features
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need for comprehensive dump analysis and trigger detection
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="p-6 hover:shadow-lg transition-shadow border-border bg-card/50 backdrop-blur-sm">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join thousands of users who trust Evolution TriggerFinder for their analysis needs
            </p>
            <Link to="/pricing">
              <Button size="lg" className="mr-4">
                <Shield className="mr-2 h-5 w-5" />
                Choose Your Plan
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}