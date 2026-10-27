// Public contact details and customer quotes for the landing page.
// Anything left empty is simply not shown, so the page never displays placeholder or invented content.

export interface Testimonial {
  name: string;
  shop: string;
  town: string;
  quote: string;
  /** Optional photo in /public, e.g. "/testimonials/bwalya.jpg" (with the person's permission). */
  photo?: string;
}

export const SITE = {
  /** WhatsApp number in international format without "+", e.g. "260971234567". */
  whatsapp: "250781782250",
  /** Phone number as people should read it, e.g. "+260 97 123 4567". */
  phone: "+250 781 782 250",
  /** Support email address. */
  email: "",
  /** Real quotes from real shop owners only. */
  testimonials: [] as Testimonial[],
};

export const whatsappLink = (text?: string) =>
  SITE.whatsapp ? `https://wa.me/${SITE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
