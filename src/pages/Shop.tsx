import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Star, Heart, Activity, Leaf } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const products = [
  {
    id: 1,
    name: "Omron BP Monitor",
    nameHi: "ओमरॉन बीपी मॉनिटर",
    description: "Clinically validated, easy-to-use digital BP monitor with irregular heartbeat detection",
    descriptionHi: "चिकित्सकीय रूप से मान्य, अनियमित दिल की धड़कन का पता लगाने वाला डिजिटल बीपी मॉनिटर",
    price: "₹2,499",
    originalPrice: "₹3,299",
    rating: 4.5,
    reviews: 2847,
    category: "Device",
    icon: Activity,
    link: "https://www.amazon.in/s?k=Omron+BP+Monitor",
    badge: "Best Seller",
  },
  {
    id: 2,
    name: "Accu-Chek Glucometer",
    nameHi: "एक्कू-चेक ग्लूकोमीटर",
    description: "Accurate blood glucose monitoring with painless testing strips",
    descriptionHi: "दर्द रहित टेस्टिंग स्ट्रिप्स के साथ सटीक रक्त शर्करा निगरानी",
    price: "₹899",
    originalPrice: "₹1,299",
    rating: 4.3,
    reviews: 1523,
    category: "Device",
    icon: Activity,
    link: "https://www.amazon.in/s?k=Accu-Chek+Glucometer",
    badge: "Popular",
  },
  {
    id: 3,
    name: "Low-GI Multigrain Atta",
    nameHi: "लो-जीआई मल्टीग्रेन आटा",
    description: "Diabetic-friendly flour blend for better blood sugar control",
    descriptionHi: "बेहतर रक्त शर्करा नियंत्रण के लिए मधुमेह-अनुकूल आटा",
    price: "₹299",
    originalPrice: "₹399",
    rating: 4.2,
    reviews: 892,
    category: "Food",
    icon: Leaf,
    link: "https://www.amazon.in/s?k=Low+GI+Multigrain+Atta",
    badge: null,
  },
  {
    id: 4,
    name: "Hibiscus Heart Tea",
    nameHi: "हिबिस्कस हार्ट टी",
    description: "Natural herbal tea known to support healthy blood pressure levels",
    descriptionHi: "स्वस्थ रक्तचाप के लिए प्राकृतिक हर्बल चाय",
    price: "₹349",
    originalPrice: "₹449",
    rating: 4.4,
    reviews: 567,
    category: "Wellness",
    icon: Heart,
    link: "https://www.amazon.in/s?k=Hibiscus+Heart+Tea",
    badge: "Heart Health",
  },
  {
    id: 5,
    name: "Omega-3 Fish Oil",
    nameHi: "ओमेगा-3 फिश ऑयल",
    description: "High-quality fish oil capsules for cardiovascular health",
    descriptionHi: "हृदय स्वास्थ्य के लिए उच्च गुणवत्ता वाले फिश ऑयल कैप्सूल",
    price: "₹599",
    originalPrice: "₹799",
    rating: 4.6,
    reviews: 3241,
    category: "Supplement",
    icon: Heart,
    link: "https://www.amazon.in/s?k=Omega-3+Fish+Oil",
    badge: "Top Rated",
  },
  {
    id: 6,
    name: "Smart Weighing Scale",
    nameHi: "स्मार्ट वेइंग स्केल",
    description: "Digital scale with body composition analysis and app sync",
    descriptionHi: "बॉडी कंपोजीशन एनालिसिस और ऐप सिंक के साथ डिजिटल स्केल",
    price: "₹1,499",
    originalPrice: "₹1,999",
    rating: 4.1,
    reviews: 1089,
    category: "Device",
    icon: Activity,
    link: "https://www.amazon.in/s?k=Smart+Weighing+Scale",
    badge: null,
  },
];

const Shop = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  return (
    <div className="min-h-screen pb-24 md:pb-6">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl md:text-4xl font-serif font-bold mb-2 text-gradient-primary">
            {t("shop.beatShop")}
          </h1>
          <p className="text-muted-foreground">
            {t("shop.beatRecommended")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product, index) => (
            <Card 
              key={product.id} 
              className="overflow-hidden group hover:shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <product.icon className="w-7 h-7 text-primary" />
                  </div>
                  {product.badge && (
                    <Badge variant="secondary" className="text-xs">
                      {product.badge === "Best Seller"
                        ? t("shop.badge.bestSeller")
                        : product.badge === "Popular"
                        ? t("shop.badge.popular")
                        : product.badge === "Heart Health"
                        ? t("shop.badge.heartHealth")
                        : t("shop.badge.topRated")}
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-lg mb-1">
                  {language === "hi" ? product.nameHi : product.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {language === "hi" ? product.descriptionHi : product.description}
                </p>

                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">{product.rating}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ({product.reviews.toLocaleString()} {t("common.reviews")})
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xl font-bold text-primary">{product.price}</span>
                    <span className="text-sm text-muted-foreground line-through ml-2">
                      {product.originalPrice}
                    </span>
                  </div>
                  <Button 
                    size="sm" 
                    className="gap-2"
                    onClick={() => window.open(product.link, "_blank")}
                  >
                    {t("shop.buy")}
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 p-6 bg-muted/50 rounded-2xl text-center">
          <p className="text-sm text-muted-foreground">
            {t("shop.membersDiscount")}
          </p>
          <Button variant="link" className="mt-2" onClick={() => navigate("/app/subscription")}>
            {t("shop.viewPremium")}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Shop;
