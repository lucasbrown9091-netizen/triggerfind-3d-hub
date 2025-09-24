import { Card } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="min-h-screen pt-16">
      <div className="container mx-auto px-4 py-20 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Terms of{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Service
            </span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        <Card className="p-8">
          <div className="prose prose-lg max-w-none dark:prose-invert">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using Evolution TriggerFinder, you accept and agree to be bound by the terms and provision of this agreement.
            </p>

            <h2>2. License and Access</h2>
            <p>
              Evolution TriggerFinder grants you a limited, non-exclusive, non-transferable license to use our service according to the plan you have purchased:
            </p>
            <ul>
              <li><strong>1 Week License:</strong> Valid for 7 days from activation</li>
              <li><strong>1 Month License:</strong> Valid for 30 days from activation</li>
              <li><strong>Lifetime License:</strong> Permanent access to the service</li>
            </ul>

            <h2>3. Acceptable Use</h2>
            <p>
              You agree to use Evolution TriggerFinder only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul>
              <li>Use the service for any illegal or unauthorized purpose</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Share your license key with others</li>
              <li>Reverse engineer or attempt to extract source code</li>
            </ul>

            <h2>4. Payment and Refunds</h2>
            <p>
              All payments are processed securely. Due to the nature of digital licenses, refunds are only available within 24 hours of purchase if the service is not accessed.
            </p>

            <h2>5. Privacy and Data Protection</h2>
            <p>
              We respect your privacy and are committed to protecting your personal data. Any files uploaded to our service are processed securely and are not stored permanently on our servers.
            </p>

            <h2>6. Service Availability</h2>
            <p>
              While we strive to maintain 99.9% uptime, we cannot guarantee uninterrupted service. We reserve the right to perform maintenance and updates as necessary.
            </p>

            <h2>7. Intellectual Property</h2>
            <p>
              All content, features, and functionality of Evolution TriggerFinder are owned by us and are protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h2>8. Limitation of Liability</h2>
            <p>
              Evolution TriggerFinder shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
            </p>

            <h2>9. Termination</h2>
            <p>
              We reserve the right to terminate or suspend your access to the service at any time for violations of these terms or other reasonable causes.
            </p>

            <h2>10. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Users will be notified of significant changes via email or through the service interface.
            </p>

            <h2>11. Contact Information</h2>
            <p>
              If you have any questions about these Terms of Service, please contact our support team through the service interface.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}