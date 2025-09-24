import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";

export default function Pricing() {
  const plans = [
    {
      name: "1 Week",
      price: "$4.99",
      duration: "7 days",
      badge: "Trial",
      description: "Perfect for testing our platform"
    },
    {
      name: "1 Month",
      price: "$7.99",
      duration: "30 days",
      badge: "Popular",
      description: "Great for regular users"
    },
    {
      name: "Lifetime",
      price: "$13.99",
      duration: "Forever",
      badge: "Best Value",
      description: "One-time payment, unlimited access"
    }
  ];

  const features = [
    "Unlimited scans",
    "Advanced dump analyzer",
    "Location finder",
    "Auto detected triggers",
    "Search keywords",
    "Webhook Deleter",
    "24/7 Support",
    "Regular Updates"
  ];

  return (
    <div className="min-h-screen pt-16">
      <div className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Choose Your{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Plan
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            All plans include the same powerful features. Choose the duration that works best for you.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card key={index} className={`p-8 relative ${index === 2 ? 'ring-2 ring-primary' : ''}`}>
              {plan.badge && (
                <Badge 
                  className={`absolute -top-3 left-1/2 transform -translate-x-1/2 ${
                    index === 2 ? 'bg-primary' : index === 1 ? 'bg-accent' : 'bg-secondary'
                  }`}
                >
                  {plan.badge}
                </Badge>
              )}
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="text-4xl font-bold text-primary mb-2">{plan.price}</div>
                <p className="text-muted-foreground">{plan.description}</p>
                <p className="text-sm text-muted-foreground mt-1">Valid for {plan.duration}</p>
              </div>

              <div className="space-y-4 mb-8">
                {features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center space-x-3">
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <Link to="/auth?mode=signup" className="w-full">
                <Button 
                  className="w-full" 
                  variant={index === 2 ? "default" : "outline"}
                  size="lg"
                >
                  Get Started
                </Button>
              </Link>
            </Card>
          ))}
        </div>

        <div className="text-center mt-16">
          <p className="text-muted-foreground">
            Need help choosing? Contact our support team for personalized recommendations.
          </p>
        </div>
      </div>
    </div>
  );
}