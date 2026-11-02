import type { OnboardingAppletPlan, OnboardingIdea, OnboardingViewPlan } from '@/lib/onboarding'

function appletBrief(
  title: string,
  applets: (OnboardingAppletPlan | OnboardingViewPlan)[]
): string {
  if (!applets.length) return `## ${title}\nNone planned.`
  return `## ${title}\n${applets
    .map(applet =>
      [
        `### ${applet.name}`,
        ...('icon' in applet ? [`Use view icon: ${applet.icon}`] : []),
        applet.description,
        ...applet.features.map(feature => `- ${feature}`)
      ].join('\n')
    )
    .join('\n\n')}`
}

export function composeBuildBrief(idea: OnboardingIdea): string {
  return [
    `Build the Moi workspace “${idea.name}”. Start implementing this plan now.`,
    `## Workspace\n${idea.description}\nIcon: ${idea.icon} (theme background, already configured).`,
    `## Theme\nFont: ${idea.theme.font}\nColor: ${idea.theme.color}\nThese workspace presets are already configured; use the existing theme tokens.`,
    appletBrief('Views', idea.views),
    appletBrief('Overview widgets', idea.widgets),
    'Follow the workspace instructions and use the normal Moi tools to create the views and widgets. Keep this Overview chat as the main coordination chat and use each view’s own build chat. Link to the views here so the user can follow their progress. Preserve the configured workspace name and icon. Use available data sources honestly and explain any access limitations.'
  ].join('\n\n')
}
