import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { APP_FEATURES } from "@/lib/types";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const firstName = profile?.display_name?.split(" ")[0] ?? "Aventureiro";

  return (
    <div className={styles.page}>
      <div className={styles.heroSection}>
        {/* Main Logo */}
        <div className={`${styles.logoContainer} anim-bounce`}>
          <svg
            viewBox="0 0 200 200"
            width={160}
            height={160}
            className={styles.logo}
          >
            <defs>
              <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e8c86e" />
                <stop offset="50%" stopColor="#c9a55a" />
                <stop offset="100%" stopColor="#8b7a3e" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Outer hexagon */}
            <polygon
              points="100,8 190,55 190,145 100,192 10,145 10,55"
              fill="none"
              stroke="url(#heroGrad)"
              strokeWidth="2"
              filter="url(#glow)"
            />
            {/* Inner hex */}
            <polygon
              points="100,30 170,65 170,135 100,170 30,135 30,65"
              fill="none"
              stroke="#c9a55a"
              strokeWidth="0.8"
              opacity="0.2"
            />
            {/* Inner detail lines */}
            <line
              x1="100"
              y1="30"
              x2="100"
              y2="170"
              stroke="#c9a55a"
              strokeWidth="0.5"
              opacity="0.1"
            />
            <line
              x1="30"
              y1="100"
              x2="170"
              y2="100"
              stroke="#c9a55a"
              strokeWidth="0.5"
              opacity="0.1"
            />
            {/* D20 text */}
            <text
              x="100"
              y="92"
              textAnchor="middle"
              fill="#c9a55a"
              fontFamily="serif"
              fontSize="36"
              fontWeight="bold"
              filter="url(#glow)"
            >
              T
            </text>
            <text
              x="100"
              y="128"
              textAnchor="middle"
              fill="#9a9488"
              fontFamily="serif"
              fontSize="14"
              letterSpacing="6"
            >
              AMIGOS
            </text>
          </svg>
        </div>

        <h1 className={`${styles.greeting} anim-fade d2`}>Olá, {firstName}</h1>
        <p className={`${styles.tagline} anim-fade d3`}>
          O que vamos fazer hoje?
        </p>
      </div>

      {/* Feature cards */}
      <div className={`${styles.featureGrid} container`}>
        {APP_FEATURES.map((feat, i) => (
          <button
            key={feat.id}
            className={`${styles.featureCard} ${!feat.enabled ? styles.featureDisabled : ""} anim-slideUp d${Math.min(i + 2, 5)}`}
            onClick={() => feat.enabled && navigate(feat.path)}
            disabled={!feat.enabled}
          >
            <span className={styles.featureIcon}>{feat.icon}</span>
            <div className={styles.featureInfo}>
              <span className={styles.featureName}>{feat.name}</span>
              <span className={styles.featureDesc}>{feat.description}</span>
            </div>
            {!feat.enabled && (
              <span className={styles.comingSoon}>Em breve</span>
            )}
            {feat.enabled && <span className={styles.arrow}>→</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
