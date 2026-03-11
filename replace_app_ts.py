import codecs
content = codecs.open('src/app.ts', 'r', 'utf-8').read()

# Fix the dangling closing brace
old_block = """    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);
    group.userData.rightLeg = rightLegPivot;
  }

  group.position.set(-5 + index * 2, 0, -0.5);"""

new_block = """    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);
    group.userData.rightLeg = rightLegPivot;

  group.position.set(-5 + index * 2, 0, -0.5);"""

content = content.replace(old_block, new_block)
codecs.open('src/app.ts', 'w', 'utf-8').write(content)
