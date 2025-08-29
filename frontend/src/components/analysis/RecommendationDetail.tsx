import React from 'react';

export interface RecommendationDetailProps {
  recommendations: string[];
  sectionTitle?: string;
}

export const RecommendationDetail: React.FC<RecommendationDetailProps> = ({
  recommendations,
  sectionTitle
}) => {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        Keine Empfehlungen für diesen Abschnitt
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sectionTitle && (
        <h4 className="text-sm font-medium text-blue-600 mb-2">
          Empfehlungen für: {sectionTitle}
        </h4>
      )}

      <div className="space-y-2">
        {recommendations.map((recommendation, index) => (
          <div key={index} className="text-sm bg-blue-50 p-3 rounded border-l-4 border-blue-400">
            <div className="text-blue-800">• {recommendation}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecommendationDetail;
