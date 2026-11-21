// Stands in for the modules around maps: operations and teams answer `audience:owner:resolve`, teams fills in team
// roles, an owner module seeds maps and lets a team's leads edit its maps through `maps:edit:resolve`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:owner:resolve', (ctx) => {
    if (ctx.owner.type !== 'operation' && ctx.owner.type !== 'team') return
    const exists = !!ctx.owner.id && !ctx.owner.id.endsWith('_missing')
    ctx.exists = exists
    if (exists) ctx.label = { da: `Ejer ${ctx.owner.id}`, en: `Owner ${ctx.owner.id}` }
  })

  nitro.hooks.hook('audience:viewer:resolve', (ctx) => {
    for (const { kind, role } of testTeamRolesOf(ctx.user.id)) {
      ctx.viewer.teamRoles.push({ ownerType: 'team', ownerId: 'tem_test', teamId: 'tem_test', kind, role, source: 'explicit' })
      ctx.viewer.ladders[kind] = ['volunteer', 'bartender', 'ba', 'coordinator']
    }
  })

  nitro.hooks.hook('maps:seed:resolve', (ctx) => {
    testMapsLog.seedCalls++
    ctx.maps.push({
      key: 'seeded-site',
      kind: 'maps.generic-geo',
      owner: { type: 'platform', id: null },
      name: { da: 'Områdekort', en: 'Site map' },
      visibility: { public: true },
      features: [
        { featureKind: 'maps.marker', geometry: { type: 'Point', coordinates: [12.079, 55.617] }, label: { da: 'Indgang', en: 'Entrance' }, properties: { description: 'Gate A' } },
        { featureKind: 'maps.area', geometry: { type: 'Polygon', coordinates: [[[12.07, 55.61], [12.08, 55.61], [12.08, 55.62], [12.07, 55.61]]] }, label: 'Camping', properties: { color: 'success' } },
      ],
    })
    ctx.maps.push({
      key: 'first-aid-opr_seed',
      kind: 'first-aid',
      owner: { type: 'operation', id: 'opr_seed' },
      name: { da: 'Førstehjælp', en: 'First aid' },
      features: [{ featureKind: 'first-aid.post', layer: 'posts', geometry: { type: 'Point', coordinates: [12.08, 55.618] }, label: 'Post 1', properties: { capacity: 4 } }],
    })
  })

  // A team's leads may edit that team's maps; here every user with an `@lead.test` email leads `tem_lead`.
  nitro.hooks.hook('maps:edit:resolve', (ctx) => {
    const email = (ctx.user as { email?: string }).email ?? ''
    if (ctx.map.ownerType === 'team' && ctx.map.ownerId === 'tem_lead' && email.endsWith('@lead.test')) ctx.allowed = true
  })

  nitro.hooks.hook('maps:feature:created', (ctx) => {
    testMapsLog.hooks.push({ name: 'created', featureId: ctx.feature.id, mapId: ctx.map.id })
  })
  nitro.hooks.hook('maps:feature:updated', (ctx) => {
    testMapsLog.hooks.push({ name: 'updated', featureId: ctx.feature.id, mapId: ctx.map.id, previousLabel: ctx.previous.label })
  })
  nitro.hooks.hook('maps:feature:deleted', (ctx) => {
    testMapsLog.hooks.push({ name: 'deleted', featureId: ctx.feature.id, mapId: ctx.map.id })
  })
})
